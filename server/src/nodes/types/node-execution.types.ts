import type { Rule } from '../../rule/schemas/rule.schema';
import type {
  WorkflowNodeConfig,
  WorkflowNodeType,
} from '../schemas/workflow-node.schema';

export interface PreviousOutputs {
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
    userPrompt?: string;
    config: WorkflowNodeConfig;
    workflowRef?: string;
  };
  context: PipelineContext;
  pipelineId: string;
  totalNodes: number;
  /** When set, mirrors pipeline node events to `content_${contentId}` for content re-run UX. */
  contentId?: string;
}

export interface NodeExecutorOutput {
  nodeId: string;
  type: WorkflowNodeType;
  output: {
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
  userPrompt?: string;
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
  userPrompt?: string;
  config: WorkflowNodeConfig;
}

/** Strongly typed input for {@link ImageGenerationService.generateImage}. */
export interface ImageGenerationInput {
  rule: Rule;
  contentPrompt: string;
  previousOutputs: { text: string };
  userPrompt?: string;
  config: WorkflowNodeConfig;
}

/** Strongly typed input for {@link TranslationService.translate}. */
export interface TranslationInput {
  rule: Rule;
  contentPrompt: string;
  previousOutputs: { text: string };
  userPrompt?: string;
  config: WorkflowNodeConfig;
}

/** Strongly typed input for {@link SummarizationService.summarize}. */
export interface SummarizationInput {
  rule: Rule;
  contentPrompt: string;
  previousOutputs: PreviousOutputs;
  userPrompt?: string;
  config: WorkflowNodeConfig;
}

/** Strongly typed input for {@link TranscriptionService.transcribe}. */
export interface TranscriptionInput {
  rule: Rule;
  contentPrompt: string;
  previousOutputs: PreviousOutputs;
  userPrompt?: string;
  config: WorkflowNodeConfig;
}

/** Strongly typed input for {@link VideoGenerationService.generateVideo}. */
export interface VideoGenerationInput {
  rule: Rule;
  contentPrompt: string;
  previousOutputs: PreviousOutputs;
  userPrompt?: string;
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
}
