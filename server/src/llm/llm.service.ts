import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOllama } from '@langchain/ollama';
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import OpenAI from 'openai';
import {
  type WorkflowNodeLlmConfigSubset,
  LlmProvider,
  WorkflowNodeType,
} from '../nodes/workflow-node-llm.enums';
import {
  allowedOpenAiImageSizesForModel,
  isValidOpenAiImageSizeForModel,
  OPENAI_IMAGE_GENERATION_MODEL,
} from '../nodes/openai-image-size.util';
import { resolveAbsoluteMediaUrlFromConfig } from '../upload/resolve-absolute-media-url.util';
import type { LlmCapability } from './strategies/provider-strategy.interface';
import { ProviderStrategyFactory } from './strategies/provider-strategy.factory';
import { DEFAULT_OPENAI_MODEL } from './strategies/openai-provider.strategy';

const DEFAULT_OPENAI_REASONING_MODEL = 'gpt-6-luna';
const DEFAULT_ANTHROPIC_MODEL = 'claude-3-5-sonnet-latest';
const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';
const DEFAULT_OLLAMA_MODEL = 'llama3.1';
const DEFAULT_FILE_SERVICE_UPLOAD_PATH = '/upload';
const DEFAULT_OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small';

const DEFAULT_CONTEXT_LIMIT = 128_000;
const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,
  'gpt-4.1': 1_047_576,
  'gpt-4.1-mini': 1_047_576,
  'o4-mini': 200_000,
  'gpt-5-mini': 200_000,
  'gpt-5.4-mini': 200_000,
  'gpt-6-luna': 1_050_000,
  'gpt-6-sol': 1_050_000,
  'gpt-6-astra': 1_050_000,
  'claude-3-5-sonnet-latest': 200_000,
  'gemini-1.5-pro': 2_000_000,
  'gemini-2.0-flash': 1_048_576,
  'gemini-2.5-flash': 1_048_576,
  'gemini-2.5-pro': 1_048_576,
};

type ProviderCapabilities = Record<LlmProvider, Record<LlmCapability, boolean>>;

const PROVIDER_CAPABILITIES: ProviderCapabilities = {
  [LlmProvider.OpenAI]: {
    chat: true,
    image_generation: true,
    video_generation: true,
    transcription: true,
    vision_describe: true,
  },
  [LlmProvider.Anthropic]: {
    chat: true,
    image_generation: false,
    video_generation: false,
    transcription: false,
    vision_describe: false,
  },
  [LlmProvider.Google]: {
    chat: true,
    image_generation: true,
    video_generation: false,
    transcription: true,
    vision_describe: true,
  },
  [LlmProvider.Groq]: {
    chat: true,
    image_generation: true,
    video_generation: true,
    transcription: true,
    vision_describe: true,
  },
  [LlmProvider.Ollama]: {
    chat: true,
    image_generation: false,
    video_generation: false,
    transcription: false,
    vision_describe: false,
  },
};

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly strategyFactory: ProviderStrategyFactory;

  constructor(
    private readonly config: ConfigService,
    strategyFactory?: ProviderStrategyFactory,
  ) {
    this.strategyFactory =
      strategyFactory ?? new ProviderStrategyFactory(this.config);
  }

  private resolveProvider(requested?: string): LlmProvider {
    return this.strategyFactory.resolveProvider(requested);
  }

  private requireApiKeyForProvider(provider: LlmProvider): string {
    const map: Record<LlmProvider, string> = {
      [LlmProvider.OpenAI]: 'OPENAI_API_KEY',
      [LlmProvider.Anthropic]: 'ANTHROPIC_API_KEY',
      [LlmProvider.Google]: 'GOOGLE_API_KEY',
      [LlmProvider.Groq]: 'GROQ_API_KEY',
      [LlmProvider.Ollama]: '',
    };
    const keyName = map[provider];
    if (!keyName) {
      return '';
    }
    const apiKey = this.config.get<string>(keyName)?.trim();
    if (!apiKey) {
      throw new Error(
        `${keyName} is not set; add it to .env to use provider "${provider}"`,
      );
    }
    return apiKey;
  }

  getDefaultModelForCapability(
    provider: string | undefined,
    capability: LlmCapability,
  ): string {
    return this.strategyFactory.getDefaultModel(provider, capability);
  }

  getProviderCapabilities(provider?: string): Record<LlmCapability, boolean> {
    return PROVIDER_CAPABILITIES[this.resolveProvider(provider)];
  }

  assertProviderCapability(
    provider: string | undefined,
    capability: LlmCapability,
  ): void {
    const resolved = this.resolveProvider(provider);
    if (!PROVIDER_CAPABILITIES[resolved][capability]) {
      throw new Error(
        `Provider "${resolved}" does not support ${capability.replace('_', ' ')}`,
      );
    }
  }

  validateWorkflowNodeConfig(
    type: WorkflowNodeType,
    config: WorkflowNodeLlmConfigSubset | undefined,
  ): void {
    const provider = this.resolveProvider(config?.provider);
    const capabilityByNodeType: Partial<
      Record<WorkflowNodeType, LlmCapability>
    > = {
      [WorkflowNodeType.KeywordPlanner]: 'chat',
      [WorkflowNodeType.TextGeneration]: 'chat',
      [WorkflowNodeType.Translation]: 'chat',
      [WorkflowNodeType.Summarization]: 'chat',
      [WorkflowNodeType.ImageGeneration]: 'image_generation',
      [WorkflowNodeType.VideoPresenter]: 'video_generation',
      [WorkflowNodeType.VideoCinematic]: 'video_generation',
      [WorkflowNodeType.VideoGeneration]: 'video_generation',
      [WorkflowNodeType.Transcription]: 'transcription',
      [WorkflowNodeType.Adapt]: 'chat',
      [WorkflowNodeType.Intelligence]: 'chat',
    };
    const capability = capabilityByNodeType[type];
    if (capability) {
      this.assertProviderCapability(provider, capability);
    }
    if (
      type === WorkflowNodeType.ImageGeneration &&
      config &&
      provider === LlmProvider.OpenAI
    ) {
      const rec = config as Record<string, unknown>;
      const model = OPENAI_IMAGE_GENERATION_MODEL;
      const sizeRaw =
        typeof rec.size === 'string' && rec.size.trim() ? rec.size.trim() : '';
      if (sizeRaw && !isValidOpenAiImageSizeForModel(sizeRaw, model)) {
        throw new Error(
          `Invalid image size "${sizeRaw}" for model "${model}". Allowed: ${allowedOpenAiImageSizesForModel(model).join(', ')}.`,
        );
      }
    }
  }

  private requireFileServiceUrl(): string {
    const baseUrl = this.config.get<string>('FILE_SERVICE_URL')?.trim();
    if (!baseUrl) {
      throw new Error(
        'FILE_SERVICE_URL is not set; add it to .env to upload generated images',
      );
    }
    return baseUrl.replace(/\/+$/, '');
  }

  /**
   * Returns a JSON-oriented chat model via ProviderStrategyFactory (OpenAI / Gemini)
   * or legacy chat providers (Anthropic / Groq / Ollama).
   */
  getChatModel(options?: {
    provider?: string;
    model?: string;
    temperature?: number;
  }): BaseChatModel {
    const provider = this.resolveProvider(options?.provider);
    this.assertProviderCapability(provider, 'chat');

    const strategy = this.strategyFactory.getStrategy(provider);
    if (strategy) {
      return strategy.createChatModel({
        mode: 'json',
        model: options?.model,
        temperature: options?.temperature,
      });
    }

    const temperature =
      typeof options?.temperature === 'number' ? options.temperature : 0.3;

    if (provider === LlmProvider.Anthropic) {
      const apiKey = this.requireApiKeyForProvider(provider);
      const model =
        options?.model?.trim() ||
        this.config.get<string>('ANTHROPIC_MODEL')?.trim() ||
        DEFAULT_ANTHROPIC_MODEL;
      return new ChatAnthropic({ apiKey, model, temperature });
    }
    if (provider === LlmProvider.Groq) {
      const apiKey = this.requireApiKeyForProvider(provider);
      const model =
        options?.model?.trim() ||
        this.config.get<string>('GROQ_MODEL')?.trim() ||
        DEFAULT_GROQ_MODEL;
      return new ChatOpenAI({
        apiKey,
        model,
        configuration: { baseURL: 'https://api.groq.com/openai/v1' },
        temperature,
      });
    }

    const model =
      options?.model?.trim() ||
      this.config.get<string>('OLLAMA_MODEL')?.trim() ||
      DEFAULT_OLLAMA_MODEL;
    return new ChatOllama({
      model,
      temperature,
      baseUrl: this.config.get<string>('OLLAMA_BASE_URL')?.trim() || undefined,
      format: 'json',
    });
  }

  /**
   * Chat model without JSON mode — for copy generation and plain text tasks.
   */
  getChatModelForPlainText(options?: {
    provider?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }): BaseChatModel {
    const provider = this.resolveProvider(options?.provider);
    this.assertProviderCapability(provider, 'chat');

    const strategy = this.strategyFactory.getStrategy(provider);
    if (strategy) {
      return strategy.createChatModel({
        mode: 'plain',
        model: options?.model,
        temperature: options?.temperature,
        maxTokens: options?.maxTokens,
      });
    }

    const temperature =
      typeof options?.temperature === 'number' ? options.temperature : 0.2;
    const maxTokens =
      typeof options?.maxTokens === 'number' ? options.maxTokens : undefined;

    if (provider === LlmProvider.Anthropic) {
      const apiKey = this.requireApiKeyForProvider(provider);
      const model =
        options?.model?.trim() ||
        this.config.get<string>('ANTHROPIC_MODEL')?.trim() ||
        DEFAULT_ANTHROPIC_MODEL;
      return new ChatAnthropic({
        apiKey,
        model,
        temperature,
        ...(maxTokens !== undefined ? { maxTokens } : {}),
      });
    }
    if (provider === LlmProvider.Groq) {
      const apiKey = this.requireApiKeyForProvider(provider);
      const model =
        options?.model?.trim() ||
        this.config.get<string>('GROQ_MODEL')?.trim() ||
        DEFAULT_GROQ_MODEL;
      return new ChatOpenAI({
        apiKey,
        model,
        configuration: { baseURL: 'https://api.groq.com/openai/v1' },
        temperature,
        ...(maxTokens !== undefined ? { maxTokens } : {}),
      });
    }
    const model =
      options?.model?.trim() ||
      this.config.get<string>('OLLAMA_MODEL')?.trim() ||
      DEFAULT_OLLAMA_MODEL;
    return new ChatOllama({
      model,
      temperature,
      numPredict: maxTokens,
      baseUrl: this.config.get<string>('OLLAMA_BASE_URL')?.trim() || undefined,
    });
  }

  /**
   * Returns a chat model wrapped with structured output validation (Zod schema or JSON schema).
   */
  getChatModelForStructuredOutput<T>(
    schema: unknown,
    options?: {
      provider?: string;
      model?: string;
      temperature?: number;
      maxTokens?: number;
      strict?: boolean;
    },
  ) {
    const provider = this.resolveProvider(options?.provider);
    this.assertProviderCapability(provider, 'chat');

    const strategy = this.strategyFactory.getStrategy(provider);
    if (strategy) {
      return strategy.createStructuredChatModel<T>(schema, options);
    }

    const plainModel = this.getChatModelForPlainText(options);
    return (plainModel as any).withStructuredOutput(schema);
  }

  getPlainTextModelId(): string {
    return (
      this.config.get<string>('OPENAI_MODEL')?.trim() || DEFAULT_OPENAI_MODEL
    );
  }

  /** The OpenAI reasoning model id currently configured (for context-limit lookups etc). */
  getReasoningModelId(): string {
    return (
      this.config.get<string>('OPENAI_REASONING_MODEL')?.trim() ||
      DEFAULT_OPENAI_REASONING_MODEL
    );
  }

  /**
   * OpenAI reasoning model for the chat operator (always OpenAI / ChatGPT).
   */
  getReasoningChatModel(options?: {
    effort?: 'none' | 'low' | 'medium' | 'high' | 'xhigh';
    maxTokens?: number;
  }): BaseChatModel {
    const apiKey = this.requireApiKeyForProvider(LlmProvider.OpenAI);
    const model = this.getReasoningModelId();
    return new ChatOpenAI({
      apiKey,
      model,
      useResponsesApi: true,
      reasoning: { effort: options?.effort ?? 'low' },
      ...(options?.maxTokens !== undefined
        ? { maxTokens: options.maxTokens }
        : {}),
    });
  }

  async describeImageForExtraction(
    buffer: Buffer,
    mimeType: string,
    options?: { provider?: string; model?: string },
  ): Promise<string> {
    const provider = this.resolveProvider(options?.provider);
    this.assertProviderCapability(provider, 'vision_describe');
    const strategy = this.strategyFactory.getStrategy(provider);
    if (strategy?.describeImageForExtraction) {
      return strategy.describeImageForExtraction({
        buffer,
        mimeType,
        model: options?.model,
      });
    }
    throw new Error(
      `Provider "${provider}" does not support vision describe`,
    );
  }

  /**
   * Embed a batch of texts for RAG storage/search (OpenAI only).
   */
  async embedTexts(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const apiKey = this.requireApiKeyForProvider(LlmProvider.OpenAI);
    const model =
      this.config.get<string>('OPENAI_EMBEDDING_MODEL')?.trim() ||
      DEFAULT_OPENAI_EMBEDDING_MODEL;
    const embeddings = new OpenAIEmbeddings({ apiKey, model });
    return embeddings.embedDocuments(texts);
  }

  /** Max context window (tokens) for the resolved model — used for the chat context-usage UI. */
  getContextLimit(model?: string): number {
    const resolved =
      model?.trim() ||
      this.config.get<string>('OPENAI_MODEL')?.trim() ||
      DEFAULT_OPENAI_MODEL;
    return MODEL_CONTEXT_LIMITS[resolved] ?? DEFAULT_CONTEXT_LIMIT;
  }

  async embedQuery(text: string): Promise<number[]> {
    const apiKey = this.requireApiKeyForProvider(LlmProvider.OpenAI);
    const model =
      this.config.get<string>('OPENAI_EMBEDDING_MODEL')?.trim() ||
      DEFAULT_OPENAI_EMBEDDING_MODEL;
    const embeddings = new OpenAIEmbeddings({ apiKey, model });
    return embeddings.embedQuery(text);
  }

  async generateImageBase64(params: {
    provider?: string;
    model: string;
    prompt: string;
    size: NonNullable<OpenAI.Images.ImageGenerateParams['size']>;
    aspectRatio?: string;
    quality: 'standard' | 'hd';
    style: 'natural' | 'vivid';
  }): Promise<{ base64: string; mimeType: string }> {
    const strategy = this.strategyFactory.requireStrategy(
      params.provider,
      'image_generation',
    );
    if (!strategy.generateImageBase64) {
      throw new Error(
        `Provider "${strategy.provider}" does not implement image generation`,
      );
    }
    return strategy.generateImageBase64(params);
  }

  async editImageBase64(params: {
    provider?: string;
    model?: string;
    prompt: string;
    images: Array<{ buffer: Buffer; fileName: string; mimeType: string }>;
    size: NonNullable<OpenAI.Images.ImageGenerateParams['size']>;
    aspectRatio?: string;
  }): Promise<{ base64: string; mimeType: string }> {
    const strategy = this.strategyFactory.requireStrategy(
      params.provider,
      'image_generation',
    );
    if (!strategy.editImageBase64) {
      throw new Error(
        `Provider "${strategy.provider}" does not implement image editing`,
      );
    }
    return strategy.editImageBase64(params);
  }

  async uploadImageBase64(params: {
    base64: string;
    mimeType: string;
    fileName: string;
    folderPath?: string;
  }): Promise<{
    fileUrl: string;
    relativePath: string;
    storedFileName: string;
    originalFileName?: string;
  }> {
    const endpoint = `${this.requireFileServiceUrl()}${DEFAULT_FILE_SERVICE_UPLOAD_PATH}`;
    try {
      const bytes = Buffer.from(params.base64, 'base64');
      const file = new Blob([bytes], { type: params.mimeType });
      const form = new FormData();
      form.append('file', file, params.fileName);
      if (params.folderPath?.trim()) {
        form.append('folderPath', params.folderPath.trim());
      }

      const response = await fetch(endpoint, { method: 'POST', body: form });
      if (response.status !== 201) {
        throw new Error(
          `Image upload failed with status ${response.status}: ${response.statusText}`,
        );
      }

      const payload = (await response.json()) as {
        success?: boolean;
        data?: {
          fileUrl?: string;
          relativePath?: string;
          storedFileName?: string;
          originalFileName?: string;
        };
      };
      const data = payload?.data;
      if (!payload?.success || !data?.fileUrl || !data?.relativePath) {
        throw new Error('Image upload returned malformed response envelope');
      }

      return {
        fileUrl:
          resolveAbsoluteMediaUrlFromConfig(data.fileUrl, this.config) ||
          data.fileUrl,
        relativePath: data.relativePath,
        storedFileName: data.storedFileName ?? params.fileName,
        originalFileName: data.originalFileName,
      };
    } catch (error) {
      this.logger.error(
        `Image upload failed | endpoint=${endpoint} | fileName=${params.fileName} | details=${this.formatError(error)}`,
      );
      throw error;
    }
  }

  async transcribeMedia(params: {
    provider?: string;
    fileBuffer: Buffer;
    fileName: string;
    mimeType: string;
    model: string;
    language?: string;
    prompt?: string;
  }): Promise<string> {
    const provider = this.resolveProvider(params.provider);
    this.assertProviderCapability(provider, 'transcription');

    const strategy = this.strategyFactory.getStrategy(provider);
    if (strategy?.transcribeMedia) {
      return strategy.transcribeMedia(params);
    }

    if (provider === LlmProvider.Groq) {
      const apiKey = this.requireApiKeyForProvider(provider);
      const client = new OpenAI({
        apiKey,
        baseURL: 'https://api.groq.com/openai/v1',
      });
      const bytes = Uint8Array.from(params.fileBuffer);
      const file = new File([bytes], params.fileName, {
        type: params.mimeType,
      });
      const response = await client.audio.transcriptions.create({
        model: 'whisper-large-v3-turbo',
        file,
        language: params.language?.trim() || undefined,
        prompt: params.prompt?.trim() || undefined,
        response_format: 'text',
      });
      return typeof response === 'string' ? response : String(response);
    }

    throw new Error(`Provider "${provider}" does not support transcription`);
  }

  async runWebSearchBrief(params: {
    prompt: string;
    model?: string;
    provider?: string;
  }): Promise<{
    text: string;
    usage?: { inputTokens: number; outputTokens: number };
  }> {
    const strategy = this.strategyFactory.requireStrategy(
      params.provider,
      'chat',
    );
    if (!strategy.runWebSearchBrief) {
      throw new Error(
        `Web search intelligence is not implemented for provider "${strategy.provider}"`,
      );
    }
    return strategy.runWebSearchBrief({
      prompt: params.prompt,
      model: params.model,
    });
  }

  private formatError(error: unknown): string {
    if (error instanceof Error) {
      const maybe = error as Error & {
        status?: number;
        code?: string;
        type?: string;
      };
      return JSON.stringify({
        name: maybe.name,
        message: maybe.message,
        status: maybe.status,
        code: maybe.code,
        type: maybe.type,
      });
    }
    return String(error ?? 'unknown');
  }
}
