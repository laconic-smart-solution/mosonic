import { Injectable, Logger } from '@nestjs/common';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { randomUUID } from 'crypto';
import { buildFileStorageFolderPath } from '../common/utils/file-storage-path.util';
import { LlmService } from '../llm/llm.service';
import { PreprocessingService } from '../preprocessing/preprocessing.service';
import type {
  PreprocessedPayload,
  UploadedFileLike,
} from '../preprocessing/preprocessed.types';
import { ImageAssetRoleClassifierService } from './image-asset-role-classifier.service';
import {
  emptySourcePack,
  type PipelineSourcePack,
  type SourcePackAsset,
} from '../pipeline/source-pack.types';

const IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

const RUN_SUMMARY_SYSTEM = [
  "You summarize THIS content-generation run's attachments for downstream AI nodes.",
  'Extract concrete product facts, claims, offers, constraints, and what each image shows.',
  'Do NOT write a brand strategy document — keep it short and factual for this specific run.',
  'When images are present, describe subject, product, logo text if any, and materials.',
  'Output plain prose only — no JSON, no markdown fences.',
].join(' ');

export type BuildSourcePackInput = {
  contentPrompt: string;
  files: UploadedFileLike[];
  urls: string[];
  brandName?: string;
  /** Folder segment for uploaded images (e.g. pipeline id or temp id). */
  storageKey: string;
};

/**
 * Preprocesses run attachments, stores image bytes, classifies image roles,
 * and produces notes for all nodes.
 */
@Injectable()
export class SourcePackBuilderService {
  private readonly logger = new Logger(SourcePackBuilderService.name);

  constructor(
    private readonly preprocessing: PreprocessingService,
    private readonly roleClassifier: ImageAssetRoleClassifierService,
    private readonly llm: LlmService,
  ) {}

  async build(input: BuildSourcePackInput): Promise<PipelineSourcePack> {
    const files = input.files ?? [];
    const urls = (input.urls ?? []).map((u) => u.trim()).filter(Boolean);
    if (files.length === 0 && urls.length === 0) {
      return emptySourcePack();
    }

    const payload = await this.preprocessing.resolvePayload({
      userText: input.contentPrompt,
      files,
      urls,
    });

    const assets: SourcePackAsset[] = [];
    const classifiable: Array<{
      id: string;
      label: string;
      mime: string;
      base64: string;
    }> = [];

    for (const chunk of payload.chunks) {
      if (chunk.kind === 'text') {
        assets.push({
          id: randomUUID(),
          kind: urls.some((u) => chunk.label.includes(u)) ? 'url' : 'file',
          label: chunk.label,
          role: 'context_only',
          confidence: 1,
        });
        continue;
      }

      const isImage = IMAGE_MIME.has(chunk.mime);
      if (!isImage) {
        assets.push({
          id: randomUUID(),
          kind: 'file',
          label: chunk.label,
          mime: chunk.mime,
          role: 'context_only',
          confidence: 1,
        });
        continue;
      }

      const id = randomUUID();
      let fileUrl: string | undefined;
      try {
        const ext = mimeToExt(chunk.mime);
        const uploaded = await this.llm.uploadImageBase64({
          base64: chunk.base64,
          mimeType: chunk.mime,
          fileName: `source-${id}.${ext}`,
          folderPath: buildFileStorageFolderPath(
            'pipeline-source',
            input.storageKey,
          ),
        });
        fileUrl = uploaded.fileUrl;
      } catch (err) {
        this.logger.warn(
          `Failed to upload source image "${chunk.label}": ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      classifiable.push({
        id,
        label: chunk.label,
        mime: chunk.mime,
        base64: chunk.base64,
      });
      assets.push({
        id,
        kind: 'image',
        label: chunk.label,
        fileUrl,
        mime: chunk.mime,
        role: 'context_only',
        confidence: 0,
      });
    }

    if (classifiable.length > 0) {
      const roles = await this.roleClassifier.classify({
        userPrompt: input.contentPrompt,
        brandName: input.brandName,
        images: classifiable,
      });
      const roleById = new Map(roles.map((r) => [r.id, r]));
      for (const asset of assets) {
        const hit = roleById.get(asset.id);
        if (hit) {
          asset.role = hit.role;
          asset.confidence = hit.confidence;
        }
      }
    }

    let notes = '';
    try {
      notes = await this.summarizeForRun(payload);
    } catch (err) {
      this.logger.warn(
        `Source pack summarize failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      notes = fallbackNotes(input.contentPrompt, assets);
    }

    return { notes: notes.trim(), assets };
  }

  private async summarizeForRun(payload: PreprocessedPayload): Promise<string> {
    const model = this.llm.getChatModelForPlainText({ temperature: 0.2 });
    const system = new SystemMessage(RUN_SUMMARY_SYSTEM);
    const hasBinary = payload.chunks.some((c) => c.kind === 'base64');
    if (hasBinary) {
      this.llm.assertProviderCapability(undefined, 'vision_describe');
    }

    if (!hasBinary) {
      const pieces: string[] = [];
      const ut = payload.userText.trim();
      if (ut) pieces.push(`User prompt:\n${ut}`);
      for (const ch of payload.chunks) {
        if (ch.kind === 'text' && ch.text.trim()) {
          pieces.push(`--- ${ch.label} ---\n${ch.text}`);
        }
      }
      const body = pieces.join('\n\n').trim();
      if (!body) return '';
      const res = await model.invoke([system, new HumanMessage(body)]);
      return typeof res.content === 'string'
        ? res.content.trim()
        : String(res.content).trim();
    }

    const content: Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } }
    > = [];
    const ut = payload.userText.trim();
    if (ut) content.push({ type: 'text', text: `User prompt:\n${ut}` });
    for (const ch of payload.chunks) {
      if (ch.kind === 'text' && ch.text.trim()) {
        content.push({
          type: 'text',
          text: `--- ${ch.label} ---\n${ch.text}`,
        });
      } else if (ch.kind === 'base64') {
        content.push({ type: 'text', text: `--- Image: ${ch.label} ---` });
        content.push({
          type: 'image_url',
          image_url: { url: `data:${ch.mime};base64,${ch.base64}` },
        });
      }
    }
    if (content.length === 0) return '';
    const res = await model.invoke([
      system,
      new HumanMessage({ content }),
    ]);
    return typeof res.content === 'string'
      ? res.content.trim()
      : String(res.content).trim();
  }
}

function mimeToExt(mime: string): string {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/gif':
      return 'gif';
    case 'image/webp':
      return 'webp';
    default:
      return 'bin';
  }
}

function fallbackNotes(
  contentPrompt: string,
  assets: SourcePackAsset[],
): string {
  const labels = assets.map((a) => `${a.label} (${a.role})`).join(', ');
  return [contentPrompt.trim(), labels ? `Attachments: ${labels}` : '']
    .filter(Boolean)
    .join('\n');
}
