import type { Rule } from '../../rule/schemas/rule.schema';
import type {
  WorkflowNodeConfig,
  WorkflowNodeType,
} from '../schemas/workflow-node.schema';

export interface PreviousOutputs {
  /** Target keywords from keyword_planner (newline-separated or plain text). */
  keywords?: string;
  text?: string;
  image?: string;
  translatedText?: string;
  summary?: string;
  transcription?: string;
  video?: string;
  /** From intelligence node — folded into downstream prompts. */
  intelligenceHints?: string;
  /** Web-search intelligence brief from intelligence node(s). */
  intelligenceBrief?: string;
  adaptedCaption?: string;
  channel?: string;
}

export interface PipelineContext {
  rule: Rule;
  contentPrompt: string;
  previousOutputs: PreviousOutputs;
}

export interface NodeExecutorInput {
  node: {
    nodeId: string;
    type: WorkflowNodeType;
    order: number;
    config: WorkflowNodeConfig;
    workflowRef?: string;
    /** Per-node user instruction from pipeline node (incl. step-review regenerate). */
    userPrompt?: string;
  };
  context: PipelineContext;
  intelligenceContext?: NodeExecutionInput['intelligenceContext'];
  pipelineId: string;
  totalNodes: number;
  /** When set, mirrors pipeline node events to `content_${contentId}` for content re-run UX. */
  contentId?: string;
  /** When set, content socket events use this id (materialized pipeline node key). */
  contentOutputNodeId?: string;
  /** App-local tenant id for cost attribution. */
  userId?: string;
  /** Rule id (stored as campaignRef on cost entries). */
  ruleId?: string;
  /** When 1, NodeExecutor does not retry internally (BullMQ handles retries). */
  maxAttempts?: number;
  /** When true, final failure is reported by the queue worker instead. */
  suppressFailedFinalEmit?: boolean;
  /** When true, node:completed is emitted by the caller (pipeline completion service). */
  suppressCompletedEmit?: boolean;
}

export interface NodeExecutorOutput {
  nodeId: string;
  type: WorkflowNodeType;
  output: {
    keywords?: string;
    text?: string;
    image?: string;
    translatedText?: string;
    summary?: string;
    transcription?: string;
    video?: string;
    intelligenceHints?: string;
    adaptedCaption?: string;
    channel?: string;
    merged?: boolean;
  };
}

/** Inputs passed from orchestration into a pipeline-node AI service. */
export type IntelligencePerformanceHint = {
  channel: string;
  contentRef: string;
  engagementRate: number;
  views: number;
};

export type IntelligenceSuggestionHint = {
  field: string;
  suggestedValue: unknown;
  reason: string;
  confidence: string;
};

export interface NodeExecutionInput {
  pipelineRef: string;
  workflowRef: string;
  nodeId: string;
  order: number;
  config?: WorkflowNodeConfig;
  /** Serialized upstream context (prior node outputs, rule excerpt, etc.). */
  context?: string;
  /** Populated by orchestration for brand-aware text generation. */
  rule?: Rule;
  /** User / campaign brief (e.g. pipeline `contentPrompt`). */
  contentPrompt?: string;
  /** Prior node outputs from completed nodes in the pipeline. */
  previousOutputs?: PreviousOutputs;
  /** Optional chunk callback for streaming-capable text nodes. */
  onChunk?: (chunk: string) => void;
  /** Analytics-backed context for intelligence nodes. */
  intelligenceContext?: {
    topPerformers: IntelligencePerformanceHint[];
    bottomPerformers: IntelligencePerformanceHint[];
    pendingSuggestions: IntelligenceSuggestionHint[];
  };
  /** Optional per-node instruction from pipeline execution (user prompt + review regenerate). */
  nodeUserPrompt?: string;
}

/** Strongly typed input for {@link TextGenerationService.generateText}. */
export interface TextGenerationInput {
  rule: Rule;
  contentPrompt: string;
  config: WorkflowNodeConfig;
  /** When set (e.g. after keyword_planner), folded into the human prompt. */
  previousOutputs?: Pick<PreviousOutputs, 'keywords'>;
}

/** Strongly typed input for {@link ImageGenerationService.generateImage}. */
export interface ImageGenerationInput {
  rule: Rule;
  contentPrompt: string;
  previousOutputs: { text: string };
  config: WorkflowNodeConfig;
}

/** Strongly typed input for {@link TranslationService.translate}. */
export interface TranslationInput {
  rule: Rule;
  contentPrompt: string;
  previousOutputs: { text: string };
  config: WorkflowNodeConfig;
}

/** Strongly typed input for {@link SummarizationService.summarize}. */
export interface SummarizationInput {
  rule: Rule;
  contentPrompt: string;
  previousOutputs: PreviousOutputs;
  config: WorkflowNodeConfig;
}

/** Strongly typed input for {@link TranscriptionService.transcribe}. */
export interface TranscriptionInput {
  rule: Rule;
  contentPrompt: string;
  previousOutputs: PreviousOutputs;
  config: WorkflowNodeConfig;
}

/** Strongly typed input for {@link VideoGenerationService.generateVideo}. */
export interface VideoGenerationInput {
  rule: Rule;
  contentPrompt: string;
  previousOutputs: PreviousOutputs;
  config: WorkflowNodeConfig;
}

export interface StoredImageOutput {
  fileUrl: string;
  relativePath: string;
  storedFileName: string;
  originalFileName?: string;
}

/** Normalized result from a single node execution step (extend as needed). */
export interface NodeExecutionResult {
  output: string | null;
  image?: StoredImageOutput;
  transcription?: string;
  video?: {
    fileUrl: string;
    relativePath: string;
    storedFileName: string;
    originalFileName?: string;
  };
  /** LangChain / provider token usage for LLM-backed nodes. */
  usage?: { inputTokens: number; outputTokens: number };
  /** Image billing metadata (normalized OpenAI params). */
  imageCost?: {
    model: string;
    size: string;
    quality: string;
    count: number;
  };
  /** Video billing metadata. */
  videoCost?: {
    model: string;
    videoSeconds: number;
    videoResolution: string;
  };
  /** Estimated source duration in seconds (Whisper). */
  audioDurationSeconds?: number;
}
