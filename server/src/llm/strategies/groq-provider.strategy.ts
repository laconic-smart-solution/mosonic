import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Runnable } from '@langchain/core/runnables';
import { ChatOpenAI } from '@langchain/openai';
import OpenAI from 'openai';
import { LlmProvider } from '../../nodes/workflow-node-llm.enums';
import type {
  AiProviderStrategy,
  ChatModelOptions,
  LlmCapability,
  StructuredChatModelOptions,
  TranscribeMediaParams,
} from './provider-strategy.interface';

export const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';
export const DEFAULT_GROQ_TRANSCRIPTION_MODEL = 'whisper-large-v3-turbo';

@Injectable()
export class GroqProviderStrategy implements AiProviderStrategy {
  readonly provider = LlmProvider.Groq;
  readonly capabilities: Record<LlmCapability, boolean> = {
    chat: true,
    image_generation: true,
    video_generation: true,
    transcription: true,
    vision_describe: true,
  };

  constructor(private readonly config: ConfigService) {}

  private requireApiKey(): string {
    const apiKey = this.config.get<string>('GROQ_API_KEY')?.trim();
    if (!apiKey) {
      throw new Error(
        `GROQ_API_KEY is not set; add it to .env to use provider "${this.provider}"`,
      );
    }
    return apiKey;
  }

  getDefaultModel(capability: LlmCapability): string {
    if (capability === 'transcription') {
      return DEFAULT_GROQ_TRANSCRIPTION_MODEL;
    }
    return (
      this.config.get<string>('GROQ_MODEL')?.trim() ||
      DEFAULT_GROQ_MODEL
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

    return new ChatOpenAI({
      apiKey,
      model,
      configuration: { baseURL: 'https://api.groq.com/openai/v1' },
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

  async transcribeMedia(params: TranscribeMediaParams): Promise<string> {
    const apiKey = this.requireApiKey();
    const client = new OpenAI({
      apiKey,
      baseURL: 'https://api.groq.com/openai/v1',
    });
    const bytes = Uint8Array.from(params.fileBuffer);
    const file = new File([bytes], params.fileName, {
      type: params.mimeType,
    });
    const response = await client.audio.transcriptions.create({
      model: params.model?.trim() || DEFAULT_GROQ_TRANSCRIPTION_MODEL,
      file,
      language: params.language?.trim() || undefined,
      prompt: params.prompt?.trim() || undefined,
      response_format: 'text',
    });
    return typeof response === 'string' ? response : String(response);
  }
}
