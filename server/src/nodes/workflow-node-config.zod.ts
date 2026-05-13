import { z } from 'zod';
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

const llmProvider = z.enum([
  LlmProvider.OpenAI,
  LlmProvider.Anthropic,
  LlmProvider.Google,
  LlmProvider.Groq,
  LlmProvider.Ollama,
]);

const imageAspectForUi = z.enum(['1:1', '16:9', '9:16', '4:5']);

/** Maps UI / config aspect presets to OpenAI Images API `size` for DALL·E 3. */
export function aspectRatioToOpenAiImageSize(
  aspectRatio: string | undefined,
  model: string,
): string {
  const m = model === 'dall-e-2' ? 'dall-e-2' : 'dall-e-3';
  if (m === 'dall-e-2') {
    return '1024x1024';
  }
  switch (aspectRatio) {
    case '16:9':
      return '1792x1024';
    case '9:16':
    case '4:5':
      return '1024x1792';
    case '1:1':
    default:
      return '1024x1024';
  }
}

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
  .strict();

const translationConfigSchema = z
  .object({
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

const videoConfigSchema = z
  .object({
    provider: llmProvider.optional(),
    model: z.string().min(1).optional(),
    duration: z.number().int().min(1).max(120).optional(),
    resolution: z.string().min(1).optional(),
    aspectRatio: videoAspect.optional(),
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
    duration: 15,
    resolution: '1080p',
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
} satisfies Record<WorkflowNodeType, WorkflowNodeConfig>;

function mergeWithDefaults(
  type: WorkflowNodeType,
  parsed: Record<string, unknown>,
): WorkflowNodeConfig {
  const base = { ...DEFAULTS[type] };
  const out: Record<string, unknown> = { ...base, ...parsed };

  if (type === WorkflowNodeType.ImageGeneration) {
    const model = typeof out.model === 'string' ? out.model : 'gpt-image-1';
    const ar =
      typeof out.aspectRatio === 'string' && out.aspectRatio
        ? out.aspectRatio
        : undefined;
    if (ar) {
      out.size = aspectRatioToOpenAiImageSize(ar, model);
    } else if (!out.size || typeof out.size !== 'string') {
      out.size = aspectRatioToOpenAiImageSize('1:1', model);
    }
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
