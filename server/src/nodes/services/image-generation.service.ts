import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import OpenAI from 'openai';
import { LlmService } from '../../llm/llm.service';
import type { Rule } from '../../rule/schemas/rule.schema';
import {
  LlmProvider,
  NodeImageQuality,
  NodeImageStyle,
  type WorkflowNodeConfig,
} from '../schemas/workflow-node.schema';
import { aspectRatioToOpenAiImageSize } from '../workflow-node-config.zod';
import type {
  ImageGenerationInput,
  NodeExecutionInput,
  NodeExecutionResult,
  StoredImageOutput,
} from '../types/node-execution.types';

/** DALL·E 3 prompt max length; leave headroom for the rest of the template. */
const MAX_QUOTED_TEXT_LEN = 2800;

type NormalizedImageConfig = {
  provider?: LlmProvider;
  model: string;
  size: NonNullable<OpenAI.Images.ImageGenerateParams['size']>;
  quality: 'standard' | 'hd';
  style: 'natural' | 'vivid';
  negativePrompt?: string;
};

function normalizeImageGenerationConfig(
  config: WorkflowNodeConfig | undefined,
): NormalizedImageConfig {
  const c = config ?? {};
  const provider =
    c.provider && Object.values(LlmProvider).includes(c.provider)
      ? c.provider
      : undefined;
  const model = typeof c.model === 'string' ? c.model : 'dall-e-3';
  const dalle3Sizes = new Set(['1024x1024', '1792x1024', '1024x1792']);
  const dalle2Sizes = new Set(['256x256', '512x512', '1024x1024']);

  const aspect =
    typeof c.aspectRatio === 'string' && c.aspectRatio.trim()
      ? c.aspectRatio.trim()
      : undefined;
  const explicitSize =
    typeof c.size === 'string' && c.size.trim() ? c.size.trim() : undefined;

  let sizeRaw: string;
  if (aspect) {
    sizeRaw = aspectRatioToOpenAiImageSize(aspect, model);
  } else if (model === 'dall-e-2') {
    sizeRaw =
      explicitSize && dalle2Sizes.has(explicitSize)
        ? explicitSize
        : '1024x1024';
  } else {
    sizeRaw =
      explicitSize && dalle3Sizes.has(explicitSize)
        ? explicitSize
        : '1024x1024';
  }

  let size: NormalizedImageConfig['size'];
  if (model === 'dall-e-2') {
    size = dalle2Sizes.has(sizeRaw) ? sizeRaw : '1024x1024';
  } else {
    size = dalle3Sizes.has(sizeRaw) ? sizeRaw : '1024x1024';
  }

  const quality =
    c.quality === NodeImageQuality.Hd ? ('hd' as const) : ('standard' as const);
  const style =
    c.style === NodeImageStyle.Vivid
      ? ('vivid' as const)
      : ('natural' as const);

  const negativePrompt =
    typeof c.negativePrompt === 'string' && c.negativePrompt.trim()
      ? c.negativePrompt.trim()
      : undefined;

  return { provider, model, size, quality, style, negativePrompt };
}

function clipTextForPrompt(text: string): string {
  const t = text.trim();
  if (t.length <= MAX_QUOTED_TEXT_LEN) {
    return t;
  }
  return `${t.slice(0, MAX_QUOTED_TEXT_LEN - 3)}...`;
}

function buildImagePrompt(
  rule: Rule,
  previousText: string,
  config: NormalizedImageConfig,
): string {
  const quoted = clipTextForPrompt(previousText);

  return [
    `Create a marketing image for the following content:`,
    `"${quoted}"`,
    '',
    `Brand: ${rule.brand.brandName}`,
    `Industry: ${rule.brand.industry}`,
    `Visual tone: ${rule.brand.brandTone.join(', ')}`,
    '',
    `Target audience: ${rule.audience.description}`,
    `Location context: ${rule.audience.location.join(', ')}`,
    '',
    `Distribution channels: ${rule.channels.map((c) => c.channel).join(', ')}`,
    `Image size: ${config.size}`,
    '',
    `Style: ${config.style === 'vivid' ? 'Bold, vibrant, eye-catching' : 'Natural, realistic, clean'}`,
    `Quality: ${config.quality === 'hd' ? 'High detail, professional grade' : 'Clean and clear'}`,
    '',
    rule.contentGuidelines.donts.length
      ? `Avoid: ${rule.contentGuidelines.donts.join(', ')}`
      : '',
    config.negativePrompt
      ? `Do not include or emphasize: ${config.negativePrompt}`
      : '',
    'No text, words, or watermarks in the image.',
    'Professional marketing quality.',
  ]
    .filter(Boolean)
    .join('\n');
}

@Injectable()
export class ImageGenerationService {
  constructor(private readonly llm: LlmService) {}

  /**
   * Builds a single DALL·E prompt from rule + **node 1 text** (not the raw content brief)
   * and stores the generated image in file-service, returning durable file metadata.
   */
  async generateImage(
    input: ImageGenerationInput & { workflowRef: string },
  ): Promise<{ image: StoredImageOutput }> {
    const { rule, previousOutputs, config, workflowRef } = input;
    const normalized = normalizeImageGenerationConfig(config);
    const imagePrompt = buildImagePrompt(rule, previousOutputs.text, normalized);

    const generated = await this.llm.generateImageBase64({
      provider: normalized.provider,
      model: normalized.model,
      prompt: imagePrompt,
      size: normalized.size,
      quality: normalized.quality,
      style: normalized.style,
    });
    const timePart = new Date().toISOString().replace(/[:.]/g, '-');
    const image = await this.llm.uploadImageBase64({
      base64: generated.base64,
      mimeType: generated.mimeType,
      fileName: `workflow-${workflowRef}-image-${timePart}.png`,
      folderPath: `workflow-images/${workflowRef}`,
    });

    return { image };
  }

  /**
   * Orchestration entry: requires `rule`, `previousOutputs.text`, and node `config`.
   */
  async execute(input: NodeExecutionInput): Promise<NodeExecutionResult> {
    if (!input.rule) {
      throw new UnprocessableEntityException(
        'Image generation requires `rule` on NodeExecutionInput',
      );
    }
    const text = input.previousOutputs?.text?.trim();
    if (!text) {
      throw new UnprocessableEntityException(
        'Image generation requires `previousOutputs.text` (text from the prior node)',
      );
    }

    const { image } = await this.generateImage({
      rule: input.rule,
      workflowRef: input.workflowRef,
      contentPrompt: input.contentPrompt ?? '',
      previousOutputs: { text },
      config: input.config ?? {},
    });

    const normalized = normalizeImageGenerationConfig(input.config ?? {});

    return {
      output: image.fileUrl,
      image,
      imageCost: {
        model: normalized.model,
        size: normalized.size,
        quality: normalized.quality,
        count: 1,
      },
    };
  }
}
