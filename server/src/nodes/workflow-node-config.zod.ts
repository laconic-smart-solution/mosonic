import { z } from 'zod';
import {
  allowedOpenAiImageSizesForModel,
  aspectRatioToOpenAiImageSize,
  coerceOpenAiImageSize,
  isValidOpenAiImageSizeForModel,
} from './openai-image-size.util';
import {
  LlmProvider,
  NodeAspectRatio,
  NodeFormalityLevel,
  NodeImageQuality,
  NodeImageStyle,
  NodeImageTemplate,
  NodeMediaSourceType,
  NodeOutputFormat,
  NodeSummaryLength,
  NodeTextTone,
  WorkflowNodeType,
  type WorkflowNodeConfig,
} from './schemas/workflow-node.schema';

export {
  allowedOpenAiImageSizesForModel,
  aspectRatioToOpenAiImageSize,
  coerceOpenAiImageSize,
  isValidOpenAiImageSizeForModel,
} from './openai-image-size.util';

const llmProvider = z.enum([
  LlmProvider.OpenAI,
  LlmProvider.Anthropic,
  LlmProvider.Google,
  LlmProvider.Groq,
  LlmProvider.Ollama,
]);

const imageAspectForUi = z.enum(['1:1', '16:9', '9:16', '4:5']);

/** Branch lane handle (normalized channel id) for lane-scoped subgraph nodes. */
const laneIdSchema = z.string().min(1).optional();

const textConfigSchema = z
  .object({
    provider: llmProvider.optional(),
    model: z.string().min(1).optional(),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().min(1).optional(),
    outputFormat: z
      .enum([
        NodeOutputFormat.Paragraph,
        NodeOutputFormat.Bullets,
        NodeOutputFormat.Caption,
      ])
      .optional(),
    tone: z
      .enum([
        NodeTextTone.Professional,
        NodeTextTone.Casual,
        NodeTextTone.Friendly,
        NodeTextTone.Formal,
        NodeTextTone.Witty,
      ])
      .optional(),
    textLength: z
      .enum([
        NodeSummaryLength.Short,
        NodeSummaryLength.Medium,
        NodeSummaryLength.Long,
      ])
      .optional(),
  })
  .strict();

const imageConfigSchema = z
  .object({
    laneId: laneIdSchema,
    channel: z.string().min(1).optional(),
    provider: llmProvider.optional(),
    model: z.string().min(1).optional(),
    size: z.string().min(1).optional(),
    quality: z
      .enum([NodeImageQuality.Standard, NodeImageQuality.Hd])
      .optional(),
    style: z.enum([NodeImageStyle.Natural, NodeImageStyle.Vivid]).optional(),
    template: z
      .enum([
        NodeImageTemplate.Auto,
        NodeImageTemplate.AdCreative,
        NodeImageTemplate.ProductMockup,
        NodeImageTemplate.Infographic,
        NodeImageTemplate.Photorealistic,
        NodeImageTemplate.Lifestyle,
      ])
      .optional(),
    aspectRatio: imageAspectForUi.optional(),
    negativePrompt: z.string().max(2000).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const model =
      typeof data.model === 'string' && data.model.trim()
        ? data.model.trim()
        : 'gpt-image-1';
    if (typeof data.size === 'string' && data.size.trim()) {
      const s = data.size.trim();
      if (!isValidOpenAiImageSizeForModel(s, model)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Invalid size "${s}" for model "${model}". Allowed: ${allowedOpenAiImageSizesForModel(model).join(', ')}.`,
          path: ['size'],
        });
      }
    }
  });

const translationConfigSchema = z
  .object({
    laneId: laneIdSchema,
    provider: llmProvider.optional(),
    model: z.string().min(1).optional(),
    sourceLanguage: z.string().min(1).max(32).optional(),
    targetLanguage: z.string().min(1).max(32).optional(),
    formalityLevel: z
      .enum([NodeFormalityLevel.Formal, NodeFormalityLevel.Casual])
      .optional(),
    preserveFormatting: z.boolean().optional(),
  })
  .strict();

const videoAspect = z.enum([
  NodeAspectRatio.R16x9,
  NodeAspectRatio.R9x16,
  NodeAspectRatio.R1x1,
  NodeAspectRatio.R4x5,
]);

const SORA_DURATION_LITERALS = [4, 8, 12, 16, 20] as const;
const PRESENTER_DURATION_LITERALS = [10, 20, 30, 40, 60] as const;

function snapToNearestDuration(
  raw: unknown,
  allowed: readonly number[],
  fallback: number,
): number {
  const n =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && raw.trim()
        ? Number(raw)
        : fallback;
  const value = Number.isFinite(n) ? n : fallback;
  let best = allowed[0];
  let bestDiff = Math.abs(value - best);
  for (const s of allowed) {
    const d = Math.abs(value - s);
    if (d < bestDiff) {
      best = s;
      bestDiff = d;
    }
  }
  return best;
}

function snapToSoraDuration(
  raw: unknown,
): (typeof SORA_DURATION_LITERALS)[number] {
  return snapToNearestDuration(
    raw,
    SORA_DURATION_LITERALS,
    8,
  ) as (typeof SORA_DURATION_LITERALS)[number];
}

function snapToPresenterDuration(
  raw: unknown,
): (typeof PRESENTER_DURATION_LITERALS)[number] {
  return snapToNearestDuration(
    raw,
    PRESENTER_DURATION_LITERALS,
    20,
  ) as (typeof PRESENTER_DURATION_LITERALS)[number];
}

const videoDurationSchema = z.preprocess((val) => val, z.number().optional());

const videoModeSchema = z.enum(['cinematic', 'presenter']).optional();

const heygenOrientationSchema = z.enum(['landscape', 'portrait']).optional();

const heygenExpressivenessSchema = z.enum(['low', 'medium', 'high']).optional();

const videoConfigObjectSchema = z
  .object({
    laneId: laneIdSchema,
    mode: videoModeSchema,
    provider: llmProvider.optional(),
    model: z.string().min(1).optional(),
    duration: videoDurationSchema,
    resolution: z.string().min(1).optional(),
    aspectRatio: videoAspect.optional(),
    negativePrompt: z.string().max(2000).optional(),
    heygenAvatarId: z.string().min(1).optional(),
    heygenAvatarAssetId: z.string().min(1).optional(),
    heygenAvatarPhotoUrl: z.string().max(2048).optional(),
    heygenBackgroundAssetId: z.string().min(1).optional(),
    heygenBackgroundUrl: z.string().max(2048).optional(),
    heygenVoiceId: z.string().min(1).optional(),
    heygenOrientation: heygenOrientationSchema,
    heygenExpressiveness: heygenExpressivenessSchema,
    heygenMotionPrompt: z.string().max(500).optional(),
    removeBackground: z.boolean().optional(),
  })
  .strict();

const videoConfigSchema = videoConfigObjectSchema.transform((data) => {
  const mode = data.mode ?? 'cinematic';
  const duration =
    mode === 'presenter'
      ? snapToPresenterDuration(data.duration)
      : snapToSoraDuration(data.duration);
  return { ...data, duration };
});

const transcriptionConfigSchema = z
  .object({
    provider: llmProvider.optional(),
    model: z.string().min(1).optional(),
    sourceType: z
      .enum([NodeMediaSourceType.Audio, NodeMediaSourceType.Video])
      .optional(),
    language: z.string().min(1).max(16).optional(),
  })
  .strict();

const summarizationConfigSchema = z
  .object({
    laneId: laneIdSchema,
    provider: llmProvider.optional(),
    model: z.string().min(1).optional(),
    summaryLength: z
      .enum([
        NodeSummaryLength.Short,
        NodeSummaryLength.Medium,
        NodeSummaryLength.Long,
      ])
      .optional(),
    outputFormat: z
      .enum([
        NodeOutputFormat.Paragraph,
        NodeOutputFormat.Bullets,
        NodeOutputFormat.Tldr,
      ])
      .optional(),
    sourceNodeRef: z.string().min(1).optional(),
  })
  .strict();

const keywordPlannerConfigSchema = z
  .object({
    provider: llmProvider.optional(),
    model: z.string().min(1).optional(),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().min(1).optional(),
  })
  .strict();

const branchConfigSchema = z
  .object({
    mode: z.enum(['rule_channels', 'wizard_channels']).optional(),
    channels: z.array(z.string().min(1)).optional(),
  })
  .strict();

const adaptConfigSchema = z
  .object({
    laneId: laneIdSchema,
    channel: z.string().min(1).optional(),
    contentStyle: z.string().optional(),
    provider: llmProvider.optional(),
    model: z.string().min(1).optional(),
  })
  .strict();

const mergeConfigSchema = z.object({}).strict();

export const IntelligenceSearchType = z.enum([
  'trend',
  'market',
  'competitor',
  'all',
  'custom',
]);
export type IntelligenceSearchTypeValue = z.infer<
  typeof IntelligenceSearchType
>;

const intelligenceConfigObjectSchema = z
  .object({
    provider: llmProvider.optional(),
    model: z.string().min(1).optional(),
    searchType: IntelligenceSearchType.default('all'),
    customPrompt: z.string().nullable().optional(),
  })
  .strict();

const intelligenceConfigSchema = intelligenceConfigObjectSchema.superRefine(
  (val, ctx) => {
    if (val.searchType === 'custom') {
      const p = val.customPrompt?.trim();
      if (!p) {
        ctx.addIssue({
          code: 'custom',
          message: 'customPrompt is required when searchType is custom',
          path: ['customPrompt'],
        });
      }
    }
  },
);

function configSchemaShapeKeys(schema: z.ZodTypeAny): string[] {
  if (schema instanceof z.ZodObject) {
    return Object.keys(schema.shape);
  }
  const inner = (schema as { _def?: { in?: unknown } })._def?.in;
  if (inner instanceof z.ZodObject) {
    return Object.keys(inner.shape);
  }
  return [];
}

const SCHEMAS: Record<WorkflowNodeType, z.ZodTypeAny> = {
  [WorkflowNodeType.KeywordPlanner]: keywordPlannerConfigSchema,
  [WorkflowNodeType.TextGeneration]: textConfigSchema,
  [WorkflowNodeType.ImageGeneration]: imageConfigSchema,
  [WorkflowNodeType.VideoGeneration]: videoConfigSchema,
  [WorkflowNodeType.Translation]: translationConfigSchema,
  [WorkflowNodeType.Transcription]: transcriptionConfigSchema,
  [WorkflowNodeType.Summarization]: summarizationConfigSchema,
  [WorkflowNodeType.Branch]: branchConfigSchema,
  [WorkflowNodeType.Adapt]: adaptConfigSchema,
  [WorkflowNodeType.Merge]: mergeConfigSchema,
  [WorkflowNodeType.Intelligence]: intelligenceConfigSchema,
};

const DEFAULTS: Record<WorkflowNodeType, WorkflowNodeConfig> = {
  [WorkflowNodeType.KeywordPlanner]: {
    model: 'gpt-4o',
    temperature: 0.3,
    maxTokens: 800,
  },
  [WorkflowNodeType.TextGeneration]: {
    model: 'gpt-4o',
    temperature: 0.7,
    maxTokens: 500,
    outputFormat: NodeOutputFormat.Paragraph,
    tone: NodeTextTone.Professional,
    textLength: NodeSummaryLength.Medium,
  },
  [WorkflowNodeType.ImageGeneration]: {
    model: 'gpt-image-1',
    quality: NodeImageQuality.Standard,
    style: NodeImageStyle.Natural,
    template: NodeImageTemplate.Auto,
    aspectRatio: NodeAspectRatio.R1x1,
    size: aspectRatioToOpenAiImageSize('1:1', 'gpt-image-1'),
  },
  [WorkflowNodeType.VideoGeneration]: {
    mode: 'cinematic',
    model: 'sora-2',
    duration: 8,
    resolution: '720p',
    aspectRatio: NodeAspectRatio.R16x9,
    heygenOrientation: 'landscape',
    heygenExpressiveness: 'medium',
    removeBackground: true,
  },
  [WorkflowNodeType.Translation]: {
    model: 'gpt-4o',
    sourceLanguage: 'auto',
    targetLanguage: 'th',
    formalityLevel: NodeFormalityLevel.Casual,
    preserveFormatting: true,
  },
  [WorkflowNodeType.Transcription]: {
    model: 'whisper-1',
    sourceType: NodeMediaSourceType.Audio,
    language: 'auto',
  },
  [WorkflowNodeType.Summarization]: {
    model: 'gpt-4o',
    summaryLength: NodeSummaryLength.Medium,
    outputFormat: NodeOutputFormat.Paragraph,
    sourceNodeRef: 'text_generation',
  },
  [WorkflowNodeType.Branch]: { mode: 'rule_channels' },
  [WorkflowNodeType.Adapt]: { model: 'gpt-4o' },
  [WorkflowNodeType.Merge]: {},
  [WorkflowNodeType.Intelligence]: {
    model: 'gpt-4o',
    searchType: 'all',
    customPrompt: null,
  },
} satisfies Record<WorkflowNodeType, WorkflowNodeConfig>;

function mergeWithDefaults(
  type: WorkflowNodeType,
  parsed: Record<string, unknown>,
): WorkflowNodeConfig {
  const base = { ...DEFAULTS[type] };
  const out: Record<string, unknown> = { ...base, ...parsed };

  if (type === WorkflowNodeType.ImageGeneration) {
    const model = typeof out.model === 'string' ? out.model : 'gpt-image-1';
    const hadAspectInParsed =
      'aspectRatio' in parsed &&
      typeof parsed.aspectRatio === 'string' &&
      parsed.aspectRatio.trim();
    if (hadAspectInParsed) {
      const ar = (parsed.aspectRatio as string).trim();
      out.aspectRatio = ar;
      out.size = aspectRatioToOpenAiImageSize(ar, model);
    } else if (
      'size' in parsed &&
      typeof parsed.size === 'string' &&
      parsed.size.trim()
    ) {
      out.size = coerceOpenAiImageSize(parsed.size.trim(), model);
    } else {
      const fallbackAr =
        typeof out.aspectRatio === 'string' && out.aspectRatio.trim()
          ? out.aspectRatio.trim()
          : '1:1';
      out.size = aspectRatioToOpenAiImageSize(fallbackAr, model);
    }
    out.size = coerceOpenAiImageSize(String(out.size), model);
  }

  return out;
}

export type ParseWorkflowNodeConfigResult =
  | { ok: true; data: WorkflowNodeConfig }
  | { ok: false; errors: string[] };

/**
 * Validates and normalizes workflow node `config` for the given node type.
 * Unknown keys are rejected by `.strict()` then stripped by parsing only known shape.
 */
/**
 * Fall back to cinematic only when clearing avatar in presenter mode.
 * Pipeline execution still requires avatar+voice via video-generation.service.
 */
export function coerceVideoConfigForPersist(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...raw };
  const hasAvatar = String(next.heygenAvatarId ?? '').trim().length > 0;
  const clearingAvatar =
    'heygenAvatarId' in raw && !String(raw.heygenAvatarId ?? '').trim();

  if (next.mode === 'presenter' && !hasAvatar && clearingAvatar) {
    next.mode = 'cinematic';
  }
  return next;
}

function configShapeKeys(type: WorkflowNodeType): string[] {
  if (type === WorkflowNodeType.VideoGeneration) {
    return Object.keys(videoConfigObjectSchema.shape);
  }
  if (type === WorkflowNodeType.Intelligence) {
    return Object.keys(intelligenceConfigObjectSchema.shape);
  }
  const schema = SCHEMAS[type];
  if (schema instanceof z.ZodObject) {
    return Object.keys(schema.shape);
  }
  return [];
}

export function parseWorkflowNodeConfig(
  type: WorkflowNodeType,
  raw: unknown,
): ParseWorkflowNodeConfigResult {
  const schema = SCHEMAS[type];
  const obj =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  const picked: Record<string, unknown> = {};
  const allowed = new Set(
    type === WorkflowNodeType.VideoGeneration
      ? Object.keys(videoConfigObjectSchema.shape)
      : configSchemaShapeKeys(schema),
  );
  for (const [k, v] of Object.entries(obj)) {
    if (allowed.has(k)) {
      picked[k] = v;
    }
  }

  if (type === WorkflowNodeType.ImageGeneration) {
    const model =
      typeof picked.model === 'string' && picked.model.trim()
        ? picked.model.trim()
        : 'gpt-image-1';
    if (typeof picked.size === 'string' && picked.size.trim()) {
      picked.size = coerceOpenAiImageSize(picked.size.trim(), model);
    }
  }

  const result = schema.safeParse(picked);
  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.map(
        (i) => `${i.path.join('.') || 'config'}: ${i.message}`,
      ),
    };
  }

  return {
    ok: true,
    data: mergeWithDefaults(type, result.data as Record<string, unknown>),
  };
}

export function parseWorkflowNodeConfigOrThrow(
  type: WorkflowNodeType,
  raw: unknown,
): WorkflowNodeConfig {
  const r = parseWorkflowNodeConfig(type, raw);
  if (!r.ok) {
    throw new Error(r.errors.join('; '));
  }
  return r.data;
}

/** Rule fields used for campaign-aware node defaults (e.g. Instagram → 9:16 video). */
export type RuleNodeConfigHint = {
  channels?: Array<{ channel?: string }>;
  audience?: { language?: string };
};

/**
 * Full workflow node defaults plus rule-aware overrides (Generate more, append node).
 */
export function defaultWorkflowNodeConfigForRule(
  type: WorkflowNodeType,
  rule?: RuleNodeConfigHint | null,
): WorkflowNodeConfig {
  const channels = rule?.channels ?? [];
  const hasInstagram = channels.some(
    (c) => (c.channel ?? '').toLowerCase() === 'instagram',
  );
  const audienceLang = rule?.audience?.language?.trim();

  const overrides: Record<string, unknown> = {};
  if (type === WorkflowNodeType.VideoGeneration && hasInstagram) {
    overrides.aspectRatio = NodeAspectRatio.R9x16;
  }
  if (
    type === WorkflowNodeType.Transcription &&
    audienceLang &&
    audienceLang.length > 0
  ) {
    overrides.language = audienceLang;
  }

  return mergeWithDefaults(type, overrides);
}
