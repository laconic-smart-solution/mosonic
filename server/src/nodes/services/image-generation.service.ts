import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';

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
import { ImagePromptComposerService } from './image-prompt-composer.service';

import { coerceOpenAiImageMime } from '../openai-image-mime.util';
import {
  aspectRatioToOpenAiImageSize,
  coerceOpenAiImageSize,
  OPENAI_IMAGE_GENERATION_MODEL,
} from '../openai-image-size.util';
import { resolveNodeModel } from '../provider-default-model.util';

import type {
  ImageGenerationInput,
  NodeExecutionInput,
  NodeExecutionResult,
  StoredImageOutput,
} from '../types/node-execution.types';
import {
  pixelAssetsFromPack,
  type SourcePackAsset,
} from '../../pipeline/source-pack.types';
import { selectKeepScenePixelAssets } from '../../orchestration/brand-image-assets.util';
import { sourceImageFetchUrls } from '../../upload/resolve-absolute-media-url.util';

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
  aspectRatio?: string;
  quality: 'standard' | 'hd';
  style: 'natural' | 'vivid';
  template: NodeImageTemplate;
  designStyle?: string;
  channel?: string;
  negativePrompt?: string;
};

export function normalizeImageGenerationConfig(
  config: WorkflowNodeConfig | undefined,
): NormalizedImageConfig {
  const c = config ?? {};

  const provider =
    c.provider && Object.values(LlmProvider).includes(c.provider)
      ? c.provider
      : undefined;

  const model = resolveNodeModel(c.model, provider, 'image');

  const aspect =
    typeof c.aspectRatio === 'string' && c.aspectRatio.trim()
      ? c.aspectRatio.trim()
      : undefined;

  const explicitSize =
    typeof c.size === 'string' && c.size.trim() ? c.size.trim() : undefined;

  let sizeRaw: string;

  if (aspect) {
    sizeRaw = aspectRatioToOpenAiImageSize(aspect, OPENAI_IMAGE_GENERATION_MODEL);
  } else if (explicitSize) {
    sizeRaw = explicitSize;
  } else {
    sizeRaw = aspectRatioToOpenAiImageSize('1:1', OPENAI_IMAGE_GENERATION_MODEL);
  }

  const size = coerceOpenAiImageSize(sizeRaw, OPENAI_IMAGE_GENERATION_MODEL);

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
    aspectRatio: aspect,
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
      : 'Do not include any text, captions, invented logos, or watermarks. Composite a provided brand_mark reference when one is listed.';

  const sections = [
    `Create a ${getImageType(effectiveTemplate)}.`,

    'BRAND',
    `Brand: ${rule.brand.brandName}`,
    `Industry: ${rule.brand.industry}`,
    rule.brand.brandDescription
      ? `Brand description: ${rule.brand.brandDescription}`
      : '',
    `Brand tone: ${rule.brand.brandTone.join(', ')}`,
    rule.brand.callToAction ? `Call to action: ${rule.brand.callToAction}` : '',

    'AUDIENCE',
    rule.audience?.description
      ? `Target audience: ${rule.audience.description}`
      : '',
    rule.audience?.location?.length
      ? `Location: ${rule.audience.location.join(', ')}`
      : '',

    'SOURCE CONTENT',
    quoted,

    'VISUAL DIRECTION',
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
  private readonly logger = new Logger(ImageGenerationService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly templateClassifier: ImageTemplateClassifierService,
    private readonly templateResolver: ImageTemplateResolverService,
    private readonly styleSelector: ImageStyleSelectorService,
    private readonly styleRepository: ImageDesignStyleRepositoryService,
    private readonly promptComposer: ImagePromptComposerService,
  ) {}

  async generateImage(
    input: ImageGenerationInput & { workflowRef: string },
  ): Promise<{ image: StoredImageOutput }> {
    const {
      rule,
      previousOutputs,
      config,
      workflowRef,
      contentPrompt,
      sourcePack,
    } = input;

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

    const pixelAssets = pixelAssetsFromPack(sourcePack, 4);
    const referenceImages = pixelAssets.map((a, i) => ({
      index: i + 1,
      label: a.label,
      role: a.role,
    }));

    const composedPrompt = await this.promptComposer.compose({
      rule,
      userPrompt: contentPrompt ?? '',
      negativePrompt: normalized.negativePrompt,
      templateName: templateRow.name,
      templatePrompt: templateRow.prompt,
      styleName: styleRow?.name,
      stylePrompt: styleRow?.prompt,
      channel: normalized.channel,
      marketingText: previousOutputs.text,
      effectiveTemplate,
      provider: normalized.provider,
      sourcePackNotes: sourcePack?.notes,
      referenceImages:
        referenceImages.length > 0 ? referenceImages : undefined,
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

    const image = await this.renderPromptToImage({
      workflowRef,
      prompt: imagePrompt,
      config,
      assets: pixelAssets,
    });

    return {
      image,
    };
  }

  /** Paint a finished prompt from the image composer. */
  async renderPromptToImage(args: {
    workflowRef: string;
    prompt: string;
    config?: WorkflowNodeConfig;
    assets: SourcePackAsset[];
    requireReferences?: boolean;
  }): Promise<StoredImageOutput> {
    const normalized = normalizeImageGenerationConfig(args.config);
    const generated =
      args.assets.length > 0
        ? await this.editWithReferences({
            provider: normalized.provider,
            model: normalized.model,
            prompt: args.prompt,
            size: normalized.size,
            aspectRatio: normalized.aspectRatio,
            assets: args.assets,
            requireAll: args.requireReferences === true,
          })
        : await this.llm.generateImageBase64({
            provider: normalized.provider,
            model: normalized.model,
            prompt: args.prompt,
            size: normalized.size,
            aspectRatio: normalized.aspectRatio,
            quality: normalized.quality,
            style: normalized.style,
          });

    const timePart = new Date().toISOString().replace(/[:.]/g, '-');
    return this.llm.uploadImageBase64({
      base64: generated.base64,
      mimeType: generated.mimeType,
      fileName: `workflow-${args.workflowRef}-image-${timePart}.png`,
      folderPath: buildFileStorageFolderPath(
        'workflow-images',
        args.workflowRef,
      ),
    });
  }

  private async editWithReferences(args: {
    provider?: LlmProvider;
    model?: string;
    prompt: string;
    size: NonNullable<OpenAI.Images.ImageGenerateParams['size']>;
    aspectRatio?: string;
    assets: SourcePackAsset[];
    requireAll?: boolean;
  }): Promise<{ base64: string; mimeType: string }> {
    const images: Array<{
      buffer: Buffer;
      fileName: string;
      mimeType: string;
    }> = [];

    for (const asset of args.assets) {
      const downloaded = await this.downloadSourceImage(asset);
      if (!downloaded) continue;
      images.push(downloaded);
    }

    if (args.requireAll && images.length < args.assets.length) {
      throw new UnprocessableEntityException(
        'Could not download the current image or brand logo for this edit.',
      );
    }

    if (images.length === 0) {
      this.logger.warn(
        'No reference images could be downloaded; falling back to generate',
      );
      return this.llm.generateImageBase64({
        provider: args.provider,
        model: args.model ?? resolveNodeModel(undefined, args.provider, 'image'),
        prompt: args.prompt,
        size: args.size,
        aspectRatio: args.aspectRatio,
        quality: 'standard',
        style: 'natural',
      });
    }

    return this.llm.editImageBase64({
      provider: args.provider,
      model: args.model,
      prompt: args.prompt,
      images,
      size: args.size,
      aspectRatio: args.aspectRatio,
    });
  }

  async execute(input: NodeExecutionInput): Promise<NodeExecutionResult> {
    if (!input.rule) {
      throw new UnprocessableEntityException(
        'Image generation requires `rule` on NodeExecutionInput',
      );
    }

    if (input.imageEdit) {
      return this.executeKeepSceneEdit(input);
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
      sourcePack: input.sourcePack,
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

  private async downloadSourceImage(asset: SourcePackAsset): Promise<{
    buffer: Buffer;
    fileName: string;
    mimeType: string;
  } | null> {
    const urls = sourceImageFetchUrls(asset, {
      fileServiceUrl: process.env.FILE_SERVICE_URL,
      publicBaseUrl: process.env.APP_URL ?? process.env.PUBLIC_URL,
    });
    for (const url of urls) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
        if (!res.ok) {
          this.logger.warn(
            `Failed to download source image ${asset.label}: HTTP ${res.status}`,
          );
          continue;
        }
        const buf = Buffer.from(await res.arrayBuffer());
        const { mimeType, ext } = coerceOpenAiImageMime({
          buffer: buf,
          declaredMime: asset.mime || res.headers.get('content-type') || undefined,
          fileName: `${asset.label ?? ''} ${asset.fileUrl ?? ''} ${asset.relativePath ?? ''} ${asset.id}`,
        });
        return {
          buffer: buf,
          fileName: `ref-${asset.id}.${ext}`,
          mimeType,
        };
      } catch (err) {
        this.logger.warn(
          `Failed to download source image ${asset.label}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return null;
  }

  /** Paint a small change onto the current photo. Does not compose a new scene. */
  private async executeKeepSceneEdit(
    input: NodeExecutionInput,
  ): Promise<NodeExecutionResult> {
    const useBrandLogo = input.imageEdit?.useBrandLogo === true;
    const assets = selectKeepScenePixelAssets(input.sourcePack, useBrandLogo);
    if (assets.length === 0) {
      throw new UnprocessableEntityException(
        'Image edit requires the current image as a reference.',
      );
    }
    if (useBrandLogo && !assets.some((asset) => asset.role === 'brand_mark')) {
      throw new UnprocessableEntityException(
        'This brand has no ready logo asset. Upload a logo on the Rule, then retry.',
      );
    }
    const lines = assets.map(
      (asset, index) =>
        `Image ${index + 1} (${asset.role}): ${asset.label}`,
    );
    const logoIndex = assets.findIndex((asset) => asset.role === 'brand_mark');
    const logoLine =
      logoIndex >= 0
        ? `Image ${logoIndex + 1} is the real brand logo file. Composite that exact logo onto Image 1. Do not redraw or invent a different mark.`
        : 'Do not invent a logo.';
    const prompt = [
      'Edit Image 1. Keep its subject, layout, people, and setting.',
      'Change only what the instruction says.',
      `Instruction: ${input.imageEdit?.instruction?.trim() || 'Apply a small correction.'}`,
      ...lines,
      logoLine,
    ].join('\n');

    const image = await this.renderPromptToImage({
      workflowRef: input.workflowRef,
      prompt,
      config: input.config,
      assets,
      requireReferences: true,
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
