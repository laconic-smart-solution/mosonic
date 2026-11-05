import { BadRequestException } from '@nestjs/common';
import type { Express } from 'express';
import {
  mergeUrlSources,
  tryNormalizeHttpUrl,
} from '../preprocessing/url-safety';
import type { UploadedFileLike } from '../preprocessing/preprocessed.types';
import { WorkflowNodeType } from '../nodes/schemas/workflow-node.schema';
import type { GenerateNodeDto } from './dto/generate-node.dto';

export type ParsedContentGenerateMultipart = {
  dto: GenerateNodeDto;
  files: UploadedFileLike[];
  urls: string[];
};

function parseUrlsField(urlsRaw: unknown): string[] {
  if (urlsRaw === undefined || urlsRaw === null || urlsRaw === '') {
    return [];
  }
  if (typeof urlsRaw !== 'string') {
    throw new BadRequestException('Field urls must be a JSON array string');
  }
  try {
    const parsed = JSON.parse(urlsRaw) as unknown;
    if (!Array.isArray(parsed)) {
      throw new BadRequestException('urls must be a JSON array');
    }
    const out: string[] = [];
    for (const u of parsed) {
      if (typeof u !== 'string' || !u.trim()) continue;
      const normalized = tryNormalizeHttpUrl(u);
      if (normalized) out.push(normalized);
    }
    return out;
  } catch (e) {
    if (e instanceof BadRequestException) throw e;
    throw new BadRequestException('urls must be valid JSON');
  }
}

function parseJsonObjectField(
  raw: unknown,
  fieldName: string,
): Record<string, unknown> | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw !== 'string') {
    throw new BadRequestException(`Field ${fieldName} must be a JSON object`);
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new BadRequestException(`Field ${fieldName} must be a JSON object`);
    }
    return parsed as Record<string, unknown>;
  } catch (e) {
    if (e instanceof BadRequestException) throw e;
    throw new BadRequestException(`Field ${fieldName} must be valid JSON`);
  }
}

/**
 * Multipart fields for POST /contents/:id/generate-node:
 * type, nodeId?, config?, message?, userPrompt?, files, urls
 */
export function parseContentGenerateMultipart(
  files: Express.Multer.File[] | undefined,
  body: Record<string, unknown>,
): ParsedContentGenerateMultipart {
  const typeRaw = typeof body.type === 'string' ? body.type.trim() : '';
  const allowed = Object.values(WorkflowNodeType) as string[];
  if (!allowed.includes(typeRaw)) {
    throw new BadRequestException('type is required and must be a valid node type');
  }

  const message =
    typeof body.message === 'string' ? body.message.trim() : undefined;
  const userPrompt =
    typeof body.userPrompt === 'string' ? body.userPrompt.trim() : undefined;
  const nodeId =
    typeof body.nodeId === 'string' ? body.nodeId.trim() : undefined;
  const config = parseJsonObjectField(body.config, 'config');

  const fileList = files ?? [];
  const urlList = mergeUrlSources(message ?? '', parseUrlsField(body.urls));

  return {
    dto: {
      type: typeRaw as WorkflowNodeType,
      nodeId: nodeId || undefined,
      config,
      message: message || undefined,
      userPrompt: userPrompt || undefined,
    },
    files: fileList.map((f) => ({
      buffer: f.buffer,
      originalname: f.originalname,
      mimetype: f.mimetype,
    })),
    urls: urlList,
  };
}
