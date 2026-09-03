import { Injectable, UnprocessableEntityException } from '@nestjs/common';

import OpenAI from 'openai';

import { buildFileStorageFolderPath } from '../../common/utils/file-storage-path.util';
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
import { ImageTemplateResolverService } from './image-template-resolver.service';
import { ImageStyleSelectorService } from './image-style-selector.service';
import { ImageDesignStyleRepositoryService } from './image-design-style-repository.service';
import { ImageDesignDirectionService } from './image-design-direction.service';
import { ImagePromptComposerService } from './image-prompt-composer.service';

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

/**
 * DALL·E 3 prompt max length.
 *
 * Kept for the legacy fallback prompt.
 * The structured prompt should normally be much shorter.
 */
const MAX_QUOTED_TEXT_LEN = 1400;

type NormalizedImageConfig = {
  provider?: LlmProvider;
  model: string;
  size: NonNullable<OpenAI.Images.ImageGenerateParams['size']>;
  quality: 'standard' | 'hd';
  style: 'natural' | 'vivid';
  template: NodeImageTemplate;
  designStyle?: string;
  channel?: string;
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

  const model =
    typeof c.model === 'string' && c.model.trim()
      ? c.model.trim()
      : 'gpt-image-1';

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

  const designStyle =
    typeof c.designStyle === 'string' && c.designStyle.trim()
      ? c.designStyle.trim()
      : undefined;

  return {
    provider,
    model,
    size,
    quality,
    style,
    template,
    designStyle,
    channel,
    negativePrompt,
  };
}

function clipTextForPrompt(text: string): string {
  const value = text.trim();

  if (value.length <= MAX_QUOTED_TEXT_LEN) {
    return value;
  }

  return `${value.slice(0, MAX_QUOTED_TEXT_LEN - 3)}...`;
}

/**
 * Maps the template to the actual visual type.
 *
 * Do not call every image a "photograph".
 */
function getImageType(template: NodeImageTemplate): string {
  switch (template) {
    case NodeImageTemplate.AdCreative:
      return 'commercial advertising creative';

    case NodeImageTemplate.ProductMockup:
      return 'professional product image';

    case NodeImageTemplate.Infographic:
      return 'professional infographic';

    case NodeImageTemplate.Photorealistic:
      return 'photorealistic image';

    case NodeImageTemplate.Lifestyle:
      return 'authentic lifestyle photograph';

    default:
      return 'professional commercial image';
  }
}

/**
 * Legacy fallback.
 *
 * This is only used if the visual brief generation fails.
 *
 * Keep it intentionally simple. The normal path should always use
 * the structured visual brief.
 */
function buildLegacyImagePrompt(
  rule: Rule,
  previousText: string,
  config: NormalizedImageConfig,
  effectiveTemplate: NodeImageTemplate,
  styleName?: string,
  stylePrompt?: string,
): string {
  const quoted = clipTextForPrompt(previousText);

  // "Create an infographic" + a blanket "no text" instruction contradict each
  // other and push the model to grab random fragments from the raw source
  // dump instead of real labels — keep the two templates' instructions apart.
  const textInstruction =
    effectiveTemplate === NodeImageTemplate.Infographic
      ? 'Include only a few short, exact labels drawn directly from the source content below — never copy full sentences as captions, and never add unrelated decorative text.'
      : 'Do not include any text, captions, logos, or watermarks.';

  const sections = [
    `Create a ${getImageType(effectiveTemplate)}.`,

    'SOURCE CONTENT',
    quoted,

    'VISUAL DIRECTION',
    `Brand tone: ${rule.brand.brandTone.join(', ')}`,
    `Industry: ${rule.brand.industry}`,

    styleName ? `Design style: ${styleName} — ${stylePrompt ?? ''}` : '',

    config.style === 'vivid'
      ? 'Use bold, vibrant visual treatment.'
      : 'Use natural, restrained visual treatment.',

    config.negativePrompt ? `Avoid: ${config.negativePrompt}` : '',

    textInstruction,
  ];

  return sections.filter(Boolean).join('\n\n');
}

@Injectable()
export class ImageGenerationService {
  constructor(
    private readonly llm: LlmService,
    private readonly templateClassifier: ImageTemplateClassifierService,
    private readonly templateResolver: ImageTemplateResolverService,
    private readonly styleSelector: ImageStyleSelectorService,
    private readonly styleRepository: ImageDesignStyleRepositoryService,
    private readonly designDirection: ImageDesignDirectionService,
    private readonly promptComposer: ImagePromptComposerService,
  ) {}

  async generateImage(
    input: ImageGenerationInput & { workflowRef: string },
  ): Promise<{ image: StoredImageOutput }> {
    const { rule, previousOutputs, config, workflowRef, contentPrompt } = input;

    const normalized = normalizeImageGenerationConfig(config);

    /** Channel-specific info feeds template classification, style selection, and composition. */
    const channelEntry = normalized.channel
      ? rule.channels?.find(
          (c) =>
            c.channel.trim().toLowerCase() ===
            normalized.channel!.toLowerCase(),
        )
      : undefined;

    /** Resolve Template (WHAT kind of image) before Style or the final prompt. */
    const effectiveTemplate =
      normalized.template === NodeImageTemplate.Auto
        ? await this.templateClassifier.classify({
            rule,
            channel: normalized.channel,
            contentStyle: channelEntry?.contentStyle,
            text: previousOutputs.text,
            userPrompt: contentPrompt,
            provider: normalized.provider,
          })
        : normalized.template;

    const templateRow = await this.templateResolver.resolve(effectiveTemplate);

    /**
     * Style: AI-picked by default (HOW it looks, independent of what kind of
     * image it is), or a manual override when the user picked one explicitly.
     */
    const hasManualDesignStyle =
      !!normalized.designStyle && normalized.designStyle !== 'auto';
    const styleKey = hasManualDesignStyle
      ? normalized.designStyle!
      : await this.styleSelector.select({
          rule,
          userPrompt: contentPrompt ?? '',
          negativePrompt: normalized.negativePrompt,
          templateName: templateRow.name,
          channel: normalized.channel,
          provider: normalized.provider,
        });
    const styleRow = await this.styleRepository.getByKey(styleKey);

    /**
     * Template + Style are merged into one coherent design direction FIRST,
     * so the Prompt Composer only ever sees one already-synthesized idea
     * instead of two raw source texts side by side (see
     * ImageDesignDirectionService for why that matters).
     */
    const direction = await this.designDirection.compose({
      templateName: templateRow.name,
      templatePrompt: templateRow.prompt,
      styleName: styleRow?.name,
      stylePrompt: styleRow?.prompt,
      provider: normalized.provider,
    });

    /**
     * Normal path: Rule + user request + design direction → one coherent
     * natural-language prompt via the Prompt Composer.
     * Fallback (composer failed): small legacy metadata-dump prompt.
     */
    const composedPrompt = await this.promptComposer.compose({
      rule,
      userPrompt: contentPrompt ?? '',
      negativePrompt: normalized.negativePrompt,
      designDirection: direction,
      channel: normalized.channel,
      marketingText: previousOutputs.text,
      effectiveTemplate,
      provider: normalized.provider,
    });

    const imagePrompt =
      composedPrompt ??
      buildLegacyImagePrompt(
        rule,
        previousOutputs.text,
        normalized,
        effectiveTemplate,
        styleRow?.name,
        styleRow?.prompt,
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

    return {
      image,
    };
  }

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
      previousOutputs: {
        text,
      },
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
