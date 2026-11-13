import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Runnable } from '@langchain/core/runnables';
import type OpenAI from 'openai';
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
import type {
  LlmCapability,
  TokenUsage,
} from './strategies/provider-strategy.interface';
import { ProviderStrategyFactory } from './strategies/provider-strategy.factory';
import {
  uploadImageBase64ToService,
  type UploadImageBase64Params,
  type UploadedImageEnvelope,
} from './utils/upload-image-base64.util';

/**
 * High-level LLM Facade for workflow nodes, chat operators, and background services.
 * Purely delegates provider routing and SDK instantiation to ProviderStrategyFactory
 * and provider-specific strategies (OpenAI, Gemini, Anthropic, Groq, Ollama).
 */
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

  resolveProvider(requested?: string): LlmProvider {
    return this.strategyFactory.resolveProvider(requested);
  }

  getDefaultModelForCapability(
    provider: string | undefined,
    capability: LlmCapability,
  ): string {
    return this.strategyFactory.getDefaultModel(provider, capability);
  }

  getProviderCapabilities(provider?: string): Record<LlmCapability, boolean> {
    return this.strategyFactory.getProviderCapabilities(provider);
  }

  assertProviderCapability(
    provider: string | undefined,
    capability: LlmCapability,
  ): void {
    this.strategyFactory.assertProviderCapability(provider, capability);
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

  getChatModel(options?: {
    provider?: string;
    model?: string;
    temperature?: number;
  }): BaseChatModel {
    const strategy = this.strategyFactory.requireStrategy(
      options?.provider,
      'chat',
    );
    return strategy.createChatModel({
      mode: 'json',
      model: options?.model,
      temperature: options?.temperature,
    });
  }

  getChatModelForPlainText(options?: {
    provider?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }): BaseChatModel {
    const strategy = this.strategyFactory.requireStrategy(
      options?.provider,
      'chat',
    );
    return strategy.createChatModel({
      mode: 'plain',
      model: options?.model,
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
    });
  }

  getChatModelForStructuredOutput<T = any>(
    schema: unknown,
    options?: {
      provider?: string;
      model?: string;
      temperature?: number;
      maxTokens?: number;
      strict?: boolean;
    },
  ): Runnable<any, T> {
    const strategy = this.strategyFactory.requireStrategy(
      options?.provider,
      'chat',
    );
    return strategy.createStructuredChatModel<T>(schema, options);
  }

  getPlainTextModelId(): string {
    return this.strategyFactory.getDefaultModel(LlmProvider.OpenAI, 'chat');
  }

  getReasoningModelId(): string {
    return this.strategyFactory.getOpenAiStrategy().getReasoningModelId();
  }

  getReasoningChatModel(options?: {
    effort?: 'none' | 'low' | 'medium' | 'high' | 'xhigh';
    maxTokens?: number;
  }): BaseChatModel {
    return this.strategyFactory
      .getOpenAiStrategy()
      .createReasoningChatModel(options);
  }

  async describeImageForExtraction(
    buffer: Buffer,
    mimeType: string,
    options?: { provider?: string; model?: string },
  ): Promise<string> {
    const strategy = this.strategyFactory.requireStrategy(
      options?.provider,
      'vision_describe',
    );
    if (!strategy.describeImageForExtraction) {
      throw new Error(
        `Provider "${strategy.provider}" does not support vision describe`,
      );
    }
    return strategy.describeImageForExtraction({
      buffer,
      mimeType,
      model: options?.model,
    });
  }

  async embedTexts(texts: string[]): Promise<number[][]> {
    return this.strategyFactory.getOpenAiStrategy().embedTexts(texts);
  }

  async embedQuery(text: string): Promise<number[]> {
    return this.strategyFactory.getOpenAiStrategy().embedQuery(text);
  }

  getContextLimit(model?: string): number {
    return this.strategyFactory.getContextLimit(model);
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

  async uploadImageBase64(
    params: UploadImageBase64Params,
  ): Promise<UploadedImageEnvelope> {
    return uploadImageBase64ToService(this.config, params, this.logger);
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
    const strategy = this.strategyFactory.requireStrategy(
      params.provider,
      'transcription',
    );
    if (!strategy.transcribeMedia) {
      throw new Error(
        `Provider "${strategy.provider}" does not support transcription`,
      );
    }
    return strategy.transcribeMedia(params);
  }

  async runWebSearchBrief(params: {
    prompt: string;
    model?: string;
    provider?: string;
  }): Promise<{
    text: string;
    usage?: TokenUsage;
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
}
