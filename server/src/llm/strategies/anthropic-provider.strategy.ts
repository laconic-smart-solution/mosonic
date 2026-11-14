import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Runnable } from '@langchain/core/runnables';
import { ChatAnthropic } from '@langchain/anthropic';
import { LlmProvider } from '../../nodes/workflow-node-llm.enums';
import type {
  AiProviderStrategy,
  ChatModelOptions,
  LlmCapability,
  StructuredChatModelOptions,
} from './provider-strategy.interface';

export const DEFAULT_ANTHROPIC_MODEL = 'claude-3-5-sonnet-latest';

@Injectable()
export class AnthropicProviderStrategy implements AiProviderStrategy {
  readonly provider = LlmProvider.Anthropic;
  readonly capabilities: Record<LlmCapability, boolean> = {
    chat: true,
    image_generation: false,
    video_generation: false,
    transcription: false,
    vision_describe: false,
  };

  constructor(private readonly config: ConfigService) {}

  private requireApiKey(): string {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY')?.trim();
    if (!apiKey) {
      throw new Error(
        `ANTHROPIC_API_KEY is not set; add it to .env to use provider "${this.provider}"`,
      );
    }
    return apiKey;
  }

  getDefaultModel(capability: LlmCapability): string {
    return (
      this.config.get<string>('ANTHROPIC_MODEL')?.trim() ||
      DEFAULT_ANTHROPIC_MODEL
    );
  }

  createChatModel(options: ChatModelOptions): BaseChatModel {
    const apiKey = this.requireApiKey();
    const model = options.model?.trim() || this.getDefaultModel('chat');
    const temperature =
      typeof options.temperature === 'number'
        ? options.temperature
        : options.mode === 'json'
          ? 0.3
          : 0.2;

    return new ChatAnthropic({
      apiKey,
      model,
      temperature,
      ...(typeof options.maxTokens === 'number'
        ? { maxTokens: options.maxTokens }
        : {}),
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
