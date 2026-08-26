import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { buildFileStorageFolderPath } from '../../common/utils/file-storage-path.util';
import OpenAI from 'openai';
import { LlmService } from '../../llm/llm.service';
import type { Rule } from '../../rule/schemas/rule.schema';
import {
  LlmProvider,
  NodeImageQuality,
  NodeImageStyle,
  NodeImageTemplate,
  type WorkflowNodeConfig,
} from '../schemas/workflow-node.schema';
import { ImageTemplateClassifierService } from './image-template-classifier.service';
import {
  aspectRatioToOpenAiImageSize,
  coerceOpenAiImageSize,
} from '../openai-image-size.util';
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
  template: NodeImageTemplate;
  channel?: string;
  negativePrompt?: string;
};

/** One short composition cue per non-`auto` template, appended to the base prompt. */
const IMAGE_TEMPLATE_GUIDANCE: Partial<Record<NodeImageTemplate, string>> = {
  [NodeImageTemplate.AdCreative]:
    'Composition: social media ad creative with bold, eye-catching layout, mobile-optimized, room for a headline.',
  [NodeImageTemplate.ProductMockup]:
    'Composition: clean product shot, studio lighting, minimal or white background, professional product photography.',
  [NodeImageTemplate.Infographic]:
    'Composition: infographic layout, clear typography-friendly structure, minimal and professional visual language.',
  [NodeImageTemplate.Photorealistic]:
    'Composition: natural photorealistic scene, realistic lighting, high-quality photography.',
  [NodeImageTemplate.Lifestyle]:
    'Composition: authentic lifestyle photograph, real people in a natural environment, candid and relatable feel.',
};

function normalizeImageGenerationConfig(
  config: WorkflowNodeConfig | undefined,
): NormalizedImageConfig {
  const c = config ?? {};
  const provider =
    c.provider && Object.values(LlmProvider).includes(c.provider)
      ? c.provider
      : undefined;
  const model = typeof c.model === 'string' ? c.model : 'gpt-image-1';
  const aspect =
    typeof c.aspectRatio === 'string' && c.aspectRatio.trim()
      ? c.aspectRatio.trim()
      : undefined;
  const explicitSize =
    typeof c.size === 'string' && c.size.trim() ? c.size.trim() : undefined;

  let sizeRaw: string;
  if (aspect) {
    sizeRaw = aspectRatioToOpenAiImageSize(aspect, model);
  } else if (explicitSize) {
    sizeRaw = explicitSize;
  } else {
    sizeRaw = aspectRatioToOpenAiImageSize('1:1', model);
  }

  const size = coerceOpenAiImageSize(sizeRaw, model);

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

  const template = Object.values(NodeImageTemplate).includes(
    c.template as NodeImageTemplate,
  )
    ? (c.template as NodeImageTemplate)
    : NodeImageTemplate.Auto;

  const channel =
    typeof c.channel === 'string' && c.channel.trim()
      ? c.channel.trim()
      : undefined;

  return {
    provider,
    model,
    size,
    quality,
    style,
    template,
    channel,
    negativePrompt,
  };
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
  effectiveTemplate: NodeImageTemplate,
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
    IMAGE_TEMPLATE_GUIDANCE[effectiveTemplate] ?? '',
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
  constructor(
    private readonly llm: LlmService,
    private readonly templateClassifier: ImageTemplateClassifierService,
  ) {}

  /**
   * Builds a single DALL·E prompt from rule + **node 1 text** (not the raw content brief)
   * and stores the generated image in file-service, returning durable file metadata.
   */
  async generateImage(
    input: ImageGenerationInput & { workflowRef: string },
  ): Promise<{ image: StoredImageOutput }> {
    const { rule, previousOutputs, config, workflowRef } = input;
    const normalized = normalizeImageGenerationConfig(config);

    const channelEntry = normalized.channel
      ? rule.channels?.find(
          (c) =>
            c.channel.trim().toLowerCase() ===
            normalized.channel!.toLowerCase(),
        )
      : undefined;

    const effectiveTemplate =
      normalized.template === NodeImageTemplate.Auto
        ? await this.templateClassifier.classify({
            rule,
            channel: normalized.channel,
            contentStyle: channelEntry?.contentStyle,
            text: previousOutputs.text,
            provider: normalized.provider,
          })
        : normalized.template;

    const imagePrompt = buildImagePrompt(
      rule,
      previousOutputs.text,
      normalized,
      effectiveTemplate,
    );

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
      folderPath: buildFileStorageFolderPath('workflow-images', workflowRef),
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
