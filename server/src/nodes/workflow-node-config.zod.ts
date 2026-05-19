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
    provider: llmProvider.optional(),
    model: z.string().min(1).optional(),
    size: z.string().min(1).optional(),
    quality: z
      .enum([NodeImageQuality.Standard, NodeImageQuality.Hd])
      .optional(),
    style: z
      .enum([NodeImageStyle.Natural, NodeImageStyle.Vivid])
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

function snapToSoraDuration(raw: unknown): (typeof SORA_DURATION_LITERALS)[number] {
  const n =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && raw.trim()
        ? Number(raw)
        : 8;
  const value = Number.isFinite(n) ? n : 8;
  let best: (typeof SORA_DURATION_LITERALS)[number] = SORA_DURATION_LITERALS[0];
  let bestDiff = Math.abs(value - best);
  for (const s of SORA_DURATION_LITERALS) {
    const d = Math.abs(value - s);
    if (d < bestDiff) {
      best = s;
      bestDiff = d;
    }
  }
  return best;
}

const soraDurationSchema = z.preprocess(
  (val) => (val === undefined ? undefined : snapToSoraDuration(val)),
  z
    .union([
      z.literal(4),
      z.literal(8),
      z.literal(12),
      z.literal(16),
      z.literal(20),
    ])
    .optional(),
);

const videoConfigSchema = z
  .object({
    laneId: laneIdSchema,
    provider: llmProvider.optional(),
    model: z.string().min(1).optional(),
    duration: soraDurationSchema,
    resolution: z.string().min(1).optional(),
    aspectRatio: videoAspect.optional(),
    negativePrompt: z.string().max(2000).optional(),
  })
  .strict();

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
    mode: z.enum(['rule_channels', 'manual']).optional(),
    channelIds: z.array(z.string().min(1)).optional(),
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
export type IntelligenceSearchTypeValue = z.infer<typeof IntelligenceSearchType>;

const intelligenceConfigSchema = z
  .object({
    provider: llmProvider.optional(),
    model: z.string().min(1).optional(),
    searchType: IntelligenceSearchType.default('all'),
    customPrompt: z.string().nullable().optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
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
  });

const SCHEMAS: Record<
  WorkflowNodeType,
  z.ZodObject<Record<string, z.ZodTypeAny>>
> = {
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
    aspectRatio: NodeAspectRatio.R1x1,
    size: aspectRatioToOpenAiImageSize('1:1', 'gpt-image-1'),
  },
  [WorkflowNodeType.VideoGeneration]: {
    model: 'sora-2',
    duration: 8,
    resolution: '720p',
    aspectRatio: NodeAspectRatio.R16x9,
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

  return out as WorkflowNodeConfig;
}

export type ParseWorkflowNodeConfigResult =
  | { ok: true; data: WorkflowNodeConfig }
  | { ok: false; errors: string[] };

/**
 * Validates and normalizes workflow node `config` for the given node type.
 * Unknown keys are rejected by `.strict()` then stripped by parsing only known shape.
 */
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
  const allowed = new Set(Object.keys(schema.shape));
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

  return { ok: true, data: mergeWithDefaults(type, result.data) };
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
