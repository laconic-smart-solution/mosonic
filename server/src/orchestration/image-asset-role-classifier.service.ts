import { Injectable, Logger } from '@nestjs/common';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { safeJsonParse } from '../common/utils/json-parse.util';
import { LlmService } from '../llm/llm.service';
import {
  IMAGE_ASSET_ROLES,
  type ImageAssetRole,
} from '../pipeline/source-pack.types';

export type ClassifiableImageAsset = {
  id: string;
  label: string;
  mime: string;
  base64: string;
};

export type ImageRoleClassification = {
  id: string;
  role: ImageAssetRole;
  confidence: number;
};

type ClassifyInput = {
  userPrompt: string;
  brandName?: string;
  images: ClassifiableImageAsset[];
};

/**
 * Infers each attached image's role from the user prompt + vision.
 * No UI confirmation — uncertain images become context_only.
 */
@Injectable()
export class ImageAssetRoleClassifierService {
  private readonly logger = new Logger(ImageAssetRoleClassifierService.name);

  constructor(private readonly llm: LlmService) {}

  async classify(input: ClassifyInput): Promise<ImageRoleClassification[]> {
    const { images, userPrompt, brandName } = input;
    if (images.length === 0) return [];

    if (images.length === 1) {
      const single = await this.classifyBatch(input);
      if (single.length === 1) return single;
      return [
        {
          id: images[0].id,
          role: this.heuristicRole(userPrompt, images[0].label),
          confidence: 0.4,
        },
      ];
    }

    try {
      return await this.classifyBatch(input);
    } catch (err) {
      this.logger.warn(
        `Image role classification failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return images.map((img) => ({
        id: img.id,
        role: this.heuristicRole(userPrompt, img.label),
        confidence: 0.3,
      }));
    }
  }

  private async classifyBatch(
    input: ClassifyInput,
  ): Promise<ImageRoleClassification[]> {
    const { images, userPrompt, brandName } = input;
    this.llm.assertProviderCapability(undefined, 'vision_describe');

    const model = this.llm.getChatModelForPlainText({ temperature: 0.1 });
    const catalog = images
      .map(
        (img, i) =>
          `Image ${i + 1}: id=${img.id}, filename="${img.label}", mime=${img.mime}`,
      )
      .join('\n');

    const system = new SystemMessage(
      [
        'You classify user-uploaded images for a marketing content pipeline.',
        'Assign exactly one role per image from:',
        IMAGE_ASSET_ROLES.join(', '),
        '',
        'Roles:',
        '- brand_mark: logo, wordmark, icon, brand lockup',
        '- product: product photo, pack shot, SKU, bottle, item to advertise',
        '- identity: person/face/mascot whose likeness must be preserved',
        '- style_ref: mood/lighting/art direction reference (not the subject)',
        '- enhance: user wants this exact image improved/edited',
        '- context_only: use for facts only; do NOT paste pixels into generation',
        '',
        'Use the user prompt as the primary signal ("here is the logo", "this product").',
        'Use vision as tie-breaker (flat mark vs pack shot vs portrait).',
        'If unsure, choose context_only.',
        'Return ONLY valid JSON: {"assets":[{"id":"...","role":"...","confidence":0.0}]}',
        'confidence is 0-1. Include every image id exactly once.',
      ].join('\n'),
    );

    const content: Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } }
    > = [
      {
        type: 'text',
        text: [
          `User prompt: "${userPrompt.trim() || '(none)'}"`,
          brandName ? `Brand: ${brandName}` : '',
          '',
          'Images to classify:',
          catalog,
          '',
          'Look at each image below in order, then return JSON.',
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ];

    for (const img of images) {
      content.push({
        type: 'image_url',
        image_url: {
          url: `data:${img.mime};base64,${img.base64}`,
        },
      });
    }

    const result = await model.invoke([
      system,
      new HumanMessage({ content }),
    ]);
    const responseText =
      typeof result.content === 'string'
        ? result.content
        : JSON.stringify(result.content);
    const parsed = safeJsonParse(responseText) as {
      assets?: unknown;
    } | null;

    const byId = new Map<string, ImageRoleClassification>();
    const list = Array.isArray(parsed?.assets) ? parsed!.assets : [];
    for (const row of list) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      const id = typeof r.id === 'string' ? r.id : '';
      const roleRaw = typeof r.role === 'string' ? r.role : '';
      const role = (IMAGE_ASSET_ROLES as readonly string[]).includes(roleRaw)
        ? (roleRaw as ImageAssetRole)
        : 'context_only';
      const confidence =
        typeof r.confidence === 'number' && Number.isFinite(r.confidence)
          ? Math.min(1, Math.max(0, r.confidence))
          : 0.5;
      if (!id) continue;
      byId.set(id, { id, role, confidence });
    }

    return images.map((img) => {
      const hit = byId.get(img.id);
      if (hit) return hit;
      return {
        id: img.id,
        role: this.heuristicRole(userPrompt, img.label),
        confidence: 0.35,
      };
    });
  }

  /** Cheap fallback when vision/LLM is unavailable. */
  heuristicRole(userPrompt: string, label: string): ImageAssetRole {
    const blob = `${userPrompt} ${label}`.toLowerCase();
    if (/\b(logo|wordmark|brand\s*mark|lockup)\b/.test(blob)) {
      return 'brand_mark';
    }
    if (
      /\b(enhance|improve|fix|remove\s+background|clean\s+up)\b/.test(blob)
    ) {
      return 'enhance';
    }
    if (/\b(style|mood|look\s+like|same\s+style|reference)\b/.test(blob)) {
      return 'style_ref';
    }
    if (/\b(face|person|portrait|likeness|identity)\b/.test(blob)) {
      return 'identity';
    }
    if (/\b(product|pack|bottle|sku|item)\b/.test(blob)) {
      return 'product';
    }
    return 'context_only';
  }
}
