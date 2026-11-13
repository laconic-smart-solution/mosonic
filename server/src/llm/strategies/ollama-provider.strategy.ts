import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Runnable } from '@langchain/core/runnables';
import { ChatOllama } from '@langchain/ollama';
import { LlmProvider } from '../../nodes/workflow-node-llm.enums';
import type {
  AiProviderStrategy,
  ChatModelOptions,
  LlmCapability,
  StructuredChatModelOptions,
} from './provider-strategy.interface';

export const DEFAULT_OLLAMA_MODEL = 'llama3.1';

@Injectable()
export class OllamaProviderStrategy implements AiProviderStrategy {
  readonly provider = LlmProvider.Ollama;
  readonly capabilities: Record<LlmCapability, boolean> = {
    chat: true,
    image_generation: false,
    video_generation: false,
    transcription: false,
    vision_describe: false,
  };

  constructor(private readonly config: ConfigService) {}

  getDefaultModel(capability: LlmCapability): string {
    return (
      this.config.get<string>('OLLAMA_MODEL')?.trim() ||
      DEFAULT_OLLAMA_MODEL
    );
  }

  createChatModel(options: ChatModelOptions): BaseChatModel {
    const model = options.model?.trim() || this.getDefaultModel('chat');
    const temperature =
      typeof options.temperature === 'number'
        ? options.temperature
        : options.mode === 'json'
          ? 0.3
          : 0.2;
    const baseUrl =
      this.config.get<string>('OLLAMA_BASE_URL')?.trim() || undefined;

    return new ChatOllama({
      model,
      temperature,
      baseUrl,
      ...(typeof options.maxTokens === 'number'
        ? { numPredict: options.maxTokens }
        : {}),
      ...(options.mode === 'json' ? { format: 'json' } : {}),
    });
  }

  createStructuredChatModel<T>(
    schema: unknown,
    options?: StructuredChatModelOptions,
  ): Runnable<any, T> {
    const plainModel = this.createChatModel({
      mode: 'plain',
      model: options?.model,
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
    });
    return (plainModel as any).withStructuredOutput(schema);
  }
}
