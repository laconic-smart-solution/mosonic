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
  };
  context: PipelineContext;
  pipelineId: string;
  totalNodes: number;
  /** When set, mirrors pipeline node events to `content_${contentId}` for content re-run UX. */
  contentId?: string;
  /** App-local tenant id for cost attribution. */
  userId?: string;
  /** Rule id (stored as campaignRef on cost entries). */
  ruleId?: string;
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
  };
}

/** Inputs passed from orchestration into a pipeline-node AI service. */
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
