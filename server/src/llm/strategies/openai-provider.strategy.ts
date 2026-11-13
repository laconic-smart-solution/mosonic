import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Runnable } from '@langchain/core/runnables';
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import OpenAI from 'openai';
import { LlmProvider } from '../../nodes/workflow-node-llm.enums';
import { coerceOpenAiImageMime } from '../../nodes/openai-image-mime.util';
import {
  coerceOpenAiImageSize,
  OPENAI_IMAGE_GENERATION_MODEL,
} from '../../nodes/openai-image-size.util';
import type {
  AiProviderStrategy,
  ChatModelOptions,
  ImageEditParams,
  ImageGenerateParams,
  LlmCapability,
  StructuredChatModelOptions,
  TranscribeMediaParams,
  VisionDescribeParams,
  WebSearchParams,
} from './provider-strategy.interface';

export const DEFAULT_OPENAI_MODEL = 'gpt-4o';
export const DEFAULT_OPENAI_REASONING_MODEL = 'gpt-6-luna';
export const DEFAULT_OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small';

function isNonChatOpenAiModel(model: string): boolean {
  const m = model.trim().toLowerCase();
  return (
    m.startsWith('gpt-image-') ||
    m.startsWith('dall-e-') ||
    m.startsWith('whisper-') ||
    m.startsWith('sora')
  );
}

@Injectable()
export class OpenAiProviderStrategy implements AiProviderStrategy {
  readonly provider = LlmProvider.OpenAI;
  readonly capabilities: Record<LlmCapability, boolean> = {
    chat: true,
    image_generation: true,
    video_generation: true,
    transcription: true,
    vision_describe: true,
  };

  private readonly logger = new Logger(OpenAiProviderStrategy.name);

  constructor(private readonly config: ConfigService) {}

  private requireApiKey(): string {
    const apiKey = this.config.get<string>('OPENAI_API_KEY')?.trim();
    if (!apiKey) {
      throw new Error(
        `OPENAI_API_KEY is not set; add it to .env to use provider "${this.provider}"`,
      );
    }
    return apiKey;
  }

  getDefaultModel(capability: LlmCapability): string {
    switch (capability) {
      case 'image_generation':
        return OPENAI_IMAGE_GENERATION_MODEL;
      case 'transcription':
        return 'whisper-1';
      case 'chat':
      case 'vision_describe':
      default:
        return (
          this.config.get<string>('OPENAI_MODEL')?.trim() ||
          DEFAULT_OPENAI_MODEL
        );
    }
  }

  private resolveChatModelId(requested?: string): string {
    const trimmed = requested?.trim();
    if (trimmed && !isNonChatOpenAiModel(trimmed)) {
      return trimmed;
    }
    return this.getDefaultModel('chat');
  }

  createChatModel(options: ChatModelOptions): BaseChatModel {
    const apiKey = this.requireApiKey();
    const model = this.resolveChatModelId(options.model);
    const temperature =
      typeof options.temperature === 'number'
        ? options.temperature
        : options.mode === 'json'
          ? 0.3
          : 0.2;

    return new ChatOpenAI({
      apiKey,
      model,
      temperature,
      ...(typeof options.maxTokens === 'number'
        ? { maxTokens: options.maxTokens }
        : {}),
      ...(options.mode === 'json'
        ? { modelKwargs: { response_format: { type: 'json_object' } } }
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
    try {
      return (plainModel as any).withStructuredOutput(schema, {
        method: 'jsonSchema',
        strict: options?.strict ?? true,
      });
    } catch {
      return (plainModel as any).withStructuredOutput(schema);
    }
  }

  async describeImageForExtraction(
    params: VisionDescribeParams,
  ): Promise<string> {
    const model = this.createChatModel({
      mode: 'plain',
      model: params.model,
    });
    const b64 = params.buffer.toString('base64');
    const dataUrl = `data:${params.mimeType};base64,${b64}`;
    const res = await model.invoke([
      new SystemMessage(
        'Look at the image and describe what it actually shows, for use as marketing/brand strategy context: subject matter, setting or scene, people or products, composition, color palette, lighting, and overall visual style or mood. Note any branding or product-presentation cues. After the visual description, separately transcribe any visible text verbatim, labeled as such. Output plain text only, no JSON.',
      ),
      new HumanMessage({
        content: [
          {
            type: 'text',
            text: 'Describe what this image shows and its visual style in detail, then list any readable text separately.',
          },
          {
            type: 'image_url',
            image_url: { url: dataUrl },
          },
        ],
      }),
    ]);

    const text =
      typeof res.content === 'string'
        ? res.content
        : Array.isArray(res.content)
          ? res.content
              .map((c) => (typeof c === 'string' ? c : JSON.stringify(c)))
              .join('\n')
          : String(res.content);
    return text.trim();
  }

  async generateImageBase64(
    params: ImageGenerateParams,
  ): Promise<{ base64: string; mimeType: string }> {
    try {
      const apiKey = this.requireApiKey();
      const client = new OpenAI({ apiKey });
      const model = OPENAI_IMAGE_GENERATION_MODEL;

      const body: OpenAI.Images.ImageGenerateParamsNonStreaming = {
        model,
        prompt: params.prompt,
        size: coerceOpenAiImageSize(String(params.size), model),
        n: 1,
        response_format: 'b64_json',
      };

      const callWithCompat = async (
        req: OpenAI.Images.ImageGenerateParamsNonStreaming,
      ): Promise<OpenAI.Images.ImagesResponse> => {
        try {
          return await client.images.generate(req);
        } catch (error: unknown) {
          const msg = this.formatError(error);
          if (msg.includes("Unknown parameter: 'response_format'")) {
            const without = { ...req };
            delete (without as { response_format?: unknown }).response_format;
            return await client.images.generate(without);
          }
          throw error;
        }
      };

      const response = await callWithCompat(body);
      return await this.extractImagePayload(response, 'generation');
    } catch (error) {
      this.logger.error(
        `OpenAI image generation failed: ${this.formatError(error)}`,
      );
      throw error;
    }
  }

  async editImageBase64(
    params: ImageEditParams,
  ): Promise<{ base64: string; mimeType: string }> {
    try {
      const apiKey = this.requireApiKey();
      const client = new OpenAI({ apiKey });
      const model = OPENAI_IMAGE_GENERATION_MODEL;

      if (!params.images.length) {
        throw new Error('editImageBase64 requires at least one reference image');
      }

      const files = params.images.map((img) => {
        const bytes = Buffer.isBuffer(img.buffer)
          ? img.buffer
          : Buffer.from(img.buffer);
        const { mimeType, ext } = coerceOpenAiImageMime({
          buffer: bytes,
          declaredMime: img.mimeType,
          fileName: img.fileName,
        });
        const baseName = img.fileName.replace(/\.[a-z0-9]+$/i, '') || 'image';
        return new File([Uint8Array.from(bytes)], `${baseName}.${ext}`, {
          type: mimeType,
        });
      });

      const body: OpenAI.Images.ImageEditParamsNonStreaming = {
        model,
        prompt: params.prompt,
        image: files.length === 1 ? files[0] : files,
        size: coerceOpenAiImageSize(String(params.size), model) as
          | '1024x1024'
          | '1024x1536'
          | '1536x1024'
          | 'auto',
        n: 1,
        response_format: 'b64_json',
      };

      let response: OpenAI.Images.ImagesResponse;
      try {
        response = await client.images.edit(body);
      } catch (error: unknown) {
        const msg = this.formatError(error);
        if (msg.includes("Unknown parameter: 'response_format'")) {
          const without = { ...body };
          delete (without as { response_format?: unknown }).response_format;
          response = await client.images.edit(without);
        } else {
          throw error;
        }
      }

      return await this.extractImagePayload(response, 'edit');
    } catch (error) {
      this.logger.error(
        `OpenAI image edit failed: ${this.formatError(error)}`,
      );
      throw error;
    }
  }

  private async extractImagePayload(
    response: OpenAI.Images.ImagesResponse,
    op: 'generation' | 'edit',
  ): Promise<{ base64: string; mimeType: string }> {
    const row = response.data?.[0];
    const base64 = row?.b64_json;
    if (base64) {
      return { base64, mimeType: 'image/png' };
    }

    const url = row?.url;
    if (typeof url === 'string' && url.trim()) {
      const res = await fetch(url.trim(), {
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) {
        throw new Error(
          `Image ${op} returned URL but download failed (${res.status})`,
        );
      }
      const mimeType =
        res.headers.get('content-type')?.split(';')[0]?.trim() || 'image/png';
      const buf = Buffer.from(await res.arrayBuffer());
      return { base64: buf.toString('base64'), mimeType };
    }

    throw new Error(`Image ${op} returned no base64 payload`);
  }

  async transcribeMedia(params: TranscribeMediaParams): Promise<string> {
    const apiKey = this.requireApiKey();
    const client = new OpenAI({ apiKey });
    const bytes = Uint8Array.from(params.fileBuffer);
    const file = new File([bytes], params.fileName, {
      type: params.mimeType,
    });
    const response = await client.audio.transcriptions.create({
      model: 'whisper-1',
      file,
      language: params.language?.trim() || undefined,
      prompt: params.prompt?.trim() || undefined,
      response_format: 'text',
    });
    return typeof response === 'string' ? response : String(response);
  }

  async runWebSearchBrief(
    params: WebSearchParams,
  ): Promise<{ text: string; usage?: { inputTokens: number; outputTokens: number } }> {
    const apiKey = this.requireApiKey();
    const client = new OpenAI({ apiKey });
    const model = this.resolveChatModelId(params.model);

    try {
      const response = await client.responses.create({
        model,
        tools: [{ type: 'web_search' }],
        input: params.prompt,
      });

      const text = (response.output_text ?? '').trim();
      const usage = response.usage;
      return {
        text,
        usage: usage
          ? {
              inputTokens: usage.input_tokens ?? 0,
              outputTokens: usage.output_tokens ?? 0,
            }
          : undefined,
      };
    } catch (error) {
      throw new Error(`OpenAI web search failed: ${this.formatError(error)}`);
    }
  }

  getReasoningModelId(): string {
    return (
      this.config.get<string>('OPENAI_REASONING_MODEL')?.trim() ||
      DEFAULT_OPENAI_REASONING_MODEL
    );
  }

  createReasoningChatModel(options?: {
    effort?: 'none' | 'low' | 'medium' | 'high' | 'xhigh';
    maxTokens?: number;
  }): BaseChatModel {
    const apiKey = this.requireApiKey();
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

  async embedTexts(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const apiKey = this.requireApiKey();
    const model =
      this.config.get<string>('OPENAI_EMBEDDING_MODEL')?.trim() ||
      DEFAULT_OPENAI_EMBEDDING_MODEL;
    const embeddings = new OpenAIEmbeddings({ apiKey, model });
    return embeddings.embedDocuments(texts);
  }

  async embedQuery(text: string): Promise<number[]> {
    const apiKey = this.requireApiKey();
    const model =
      this.config.get<string>('OPENAI_EMBEDDING_MODEL')?.trim() ||
      DEFAULT_OPENAI_EMBEDDING_MODEL;
    const embeddings = new OpenAIEmbeddings({ apiKey, model });
    return embeddings.embedQuery(text);
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
