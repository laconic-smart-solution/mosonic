import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type OpenAI from 'openai';
import type { LlmProvider } from '../../nodes/workflow-node-llm.enums';

export type LlmCapability =
  | 'chat'
  | 'image_generation'
  | 'video_generation'
  | 'transcription'
  | 'vision_describe';

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface ChatModelOptions {
  mode: 'json' | 'plain';
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface StructuredChatModelOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  strict?: boolean;
}

export interface ImageGenerateParams {
  model?: string;
  prompt: string;
  size: NonNullable<OpenAI.Images.ImageGenerateParams['size']>;
  aspectRatio?: string;
  quality: 'standard' | 'hd';
  style: 'natural' | 'vivid';
}

export interface ImageEditParams {
  model?: string;
  prompt: string;
  images: Array<{ buffer: Buffer; fileName: string; mimeType: string }>;
  size: NonNullable<OpenAI.Images.ImageGenerateParams['size']>;
  aspectRatio?: string;
}

export interface TranscribeMediaParams {
  fileBuffer: Buffer;
  fileName: string;
  mimeType: string;
  model?: string;
  language?: string;
  prompt?: string;
}

export interface WebSearchParams {
  prompt: string;
  model?: string;
}

export interface VisionDescribeParams {
  buffer: Buffer;
  mimeType: string;
  model?: string;
}

/**
 * Strategy interface isolating AI provider SDK / LangChain mechanics per provider.
 */
export interface AiProviderStrategy {
  readonly provider: LlmProvider;
  readonly capabilities: Record<LlmCapability, boolean>;

  getDefaultModel(capability: LlmCapability): string;

  createChatModel(options: ChatModelOptions): BaseChatModel;

  createStructuredChatModel<T>(
    schema: unknown,
    options?: StructuredChatModelOptions,
  ): unknown;

  generateImageBase64?(
    params: ImageGenerateParams,
  ): Promise<{ base64: string; mimeType: string }>;

  editImageBase64?(
    params: ImageEditParams,
  ): Promise<{ base64: string; mimeType: string }>;

  transcribeMedia?(params: TranscribeMediaParams): Promise<string>;

  runWebSearchBrief?(
    params: WebSearchParams,
  ): Promise<{ text: string; usage?: TokenUsage }>;

  describeImageForExtraction?(params: VisionDescribeParams): Promise<string>;
}
