import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Runnable } from '@langchain/core/runnables';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { GoogleGenAI } from '@google/genai';
import { LlmProvider } from '../../nodes/workflow-node-llm.enums';
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

export const DEFAULT_GOOGLE_CHAT_MODEL = 'gemini-2.5-flash';
export const DEFAULT_GOOGLE_IMAGE_MODEL = 'gemini-2.5-flash-image';
export const DEFAULT_GOOGLE_TRANSCRIPTION_MODEL = 'gemini-2.5-flash';

function isNonChatGoogleModel(model: string): boolean {
  const m = model.trim().toLowerCase();
  return (
    m.startsWith('imagen-') ||
    m.endsWith('-image') ||
    m.includes('-image-') ||
    m.startsWith('veo-')
  );
}

function resolveAspectRatio(
  aspectRatio?: string,
  size?: string,
): string | undefined {
  const ar = aspectRatio?.trim();
  if (ar && ['1:1', '3:4', '4:3', '4:5', '9:16', '16:9'].includes(ar)) {
    return ar;
  }
  const s = size?.trim();
  if (s === '1024x1536' || s === '1024x1792') return '9:16';
  if (s === '1536x1024' || s === '1792x1024') return '16:9';
  if (s === '1024x1024') return '1:1';
  return '1:1';
}

@Injectable()
export class GeminiProviderStrategy implements AiProviderStrategy {
  readonly provider = LlmProvider.Google;
  readonly capabilities: Record<LlmCapability, boolean> = {
    chat: true,
    image_generation: true,
    video_generation: false,
    transcription: true,
    vision_describe: true,
  };

  private readonly logger = new Logger(GeminiProviderStrategy.name);

  constructor(private readonly config: ConfigService) {}

  private requireApiKey(): string {
    const apiKey = this.config.get<string>('GOOGLE_API_KEY')?.trim();
    if (!apiKey) {
      throw new Error(
        `GOOGLE_API_KEY is not set; add it to .env to use provider "${this.provider}"`,
      );
    }
    return apiKey;
  }

  private createGenAiClient(): GoogleGenAI {
    return new GoogleGenAI({ apiKey: this.requireApiKey() });
  }

  getDefaultModel(capability: LlmCapability): string {
    switch (capability) {
      case 'image_generation':
        return (
          this.config.get<string>('GOOGLE_IMAGE_MODEL')?.trim() ||
          DEFAULT_GOOGLE_IMAGE_MODEL
        );
      case 'transcription':
        return (
          this.config.get<string>('GOOGLE_TRANSCRIPTION_MODEL')?.trim() ||
          DEFAULT_GOOGLE_TRANSCRIPTION_MODEL
        );
      case 'chat':
      case 'vision_describe':
      default:
        return (
          this.config.get<string>('GOOGLE_MODEL')?.trim() ||
          DEFAULT_GOOGLE_CHAT_MODEL
        );
    }
  }

  private resolveChatModelId(requested?: string): string {
    const trimmed = requested?.trim();
    if (trimmed && !isNonChatGoogleModel(trimmed)) {
      return trimmed;
    }
    return this.getDefaultModel('chat');
  }

  private resolveImageModelId(requested?: string): string {
    const trimmed = requested?.trim();
    if (
      trimmed &&
      (trimmed.toLowerCase().includes('image') ||
        trimmed.toLowerCase().startsWith('imagen-'))
    ) {
      return trimmed;
    }
    return this.getDefaultModel('image_generation');
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

    return new ChatGoogleGenerativeAI({
      apiKey,
      model,
      temperature,
      ...(typeof options.maxTokens === 'number'
        ? { maxOutputTokens: options.maxTokens }
        : {}),
      ...(options.mode === 'json' ? { json: true } : {}),
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

  async describeImageForExtraction(
    params: VisionDescribeParams,
  ): Promise<string> {
    const ai = this.createGenAiClient();
    const model = this.resolveChatModelId(params.model);

    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [
            {
              text:
                'Look at the image and describe what it actually shows, for use as marketing/brand strategy context: subject matter, setting or scene, people or products, composition, color palette, lighting, and overall visual style or mood. Note any branding or product-presentation cues. After the visual description, separately transcribe any visible text verbatim, labeled as such. Output plain text only, no JSON.',
            },
            {
              inlineData: {
                data: params.buffer.toString('base64'),
                mimeType: params.mimeType || 'image/png',
              },
            },
          ],
        },
      ],
    });

    return (response.text ?? '').trim();
  }

  async generateImageBase64(
    params: ImageGenerateParams,
  ): Promise<{ base64: string; mimeType: string }> {
    const ai = this.createGenAiClient();
    const model = this.resolveImageModelId(params.model);
    const aspectRatio = resolveAspectRatio(params.aspectRatio, String(params.size));

    try {
      if (model.toLowerCase().startsWith('imagen-')) {
        const res = await ai.models.generateImages({
          model,
          prompt: params.prompt,
          config: {
            numberOfImages: 1,
            ...(aspectRatio ? { aspectRatio } : {}),
            outputMimeType: 'image/png',
          },
        });
        const generated = res.generatedImages?.[0]?.image;
        if (!generated?.imageBytes) {
          throw new Error('Imagen returned no imageBytes payload');
        }
        return {
          base64: generated.imageBytes,
          mimeType: generated.mimeType || 'image/png',
        };
      }

      const res = await ai.models.generateContent({
        model,
        contents: params.prompt,
        config: {
          responseModalities: ['IMAGE'],
          ...(aspectRatio ? { imageConfig: { aspectRatio } } : {}),
        },
      });

      const part = res.candidates?.[0]?.content?.parts?.find(
        (p) => p.inlineData?.data,
      );
      if (!part?.inlineData?.data) {
        throw new Error(`Gemini image generation (${model}) returned no inlineData payload`);
      }

      return {
        base64: part.inlineData.data,
        mimeType: part.inlineData.mimeType || 'image/png',
      };
    } catch (error) {
      this.logger.error(
        `Gemini image generation (${model}) failed: ${this.formatError(error)}`,
      );
      throw error;
    }
  }

  async editImageBase64(
    params: ImageEditParams,
  ): Promise<{ base64: string; mimeType: string }> {
    if (!params.images.length) {
      throw new Error('editImageBase64 requires at least one reference image');
    }

    const ai = this.createGenAiClient();
    const rawModel = this.resolveImageModelId(params.model);
    // Imagen models don't accept multi-image generateContent edits directly; use Gemini image model
    const model = rawModel.toLowerCase().startsWith('imagen-')
      ? DEFAULT_GOOGLE_IMAGE_MODEL
      : rawModel;
    const aspectRatio = resolveAspectRatio(params.aspectRatio, String(params.size));

    try {
      const parts = [
        { text: params.prompt },
        ...params.images.map((img) => ({
          inlineData: {
            data: (Buffer.isBuffer(img.buffer)
              ? img.buffer
              : Buffer.from(img.buffer)
            ).toString('base64'),
            mimeType: img.mimeType || 'image/png',
          },
        })),
      ];

      const res = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts }],
        config: {
          responseModalities: ['IMAGE'],
          ...(aspectRatio ? { imageConfig: { aspectRatio } } : {}),
        },
      });

      const part = res.candidates?.[0]?.content?.parts?.find(
        (p) => p.inlineData?.data,
      );
      if (!part?.inlineData?.data) {
        throw new Error(`Gemini image edit (${model}) returned no inlineData payload`);
      }

      return {
        base64: part.inlineData.data,
        mimeType: part.inlineData.mimeType || 'image/png',
      };
    } catch (error) {
      this.logger.error(
        `Gemini image edit (${model}) failed: ${this.formatError(error)}`,
      );
      throw error;
    }
  }

  async transcribeMedia(params: TranscribeMediaParams): Promise<string> {
    const ai = this.createGenAiClient();
    const model = this.resolveChatModelId(
      params.model || this.getDefaultModel('transcription'),
    );
    const langHint =
      params.language && params.language.trim() && params.language !== 'auto'
        ? ` The spoken language is primarily "${params.language.trim()}".`
        : '';

    const instruction = [
      'Transcribe the spoken words in this audio/video accurately and verbatim.',
      langHint,
      params.prompt?.trim() ? `Context: ${params.prompt.trim()}` : '',
      'Output ONLY the raw transcript text with natural punctuation. No preamble, no timestamps unless spoken, no commentary.',
    ]
      .filter(Boolean)
      .join(' ');

    try {
      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [
              { text: instruction },
              {
                inlineData: {
                  data: params.fileBuffer.toString('base64'),
                  mimeType: params.mimeType || 'audio/mpeg',
                },
              },
            ],
          },
        ],
      });

      return (response.text ?? '').trim();
    } catch (error) {
      this.logger.error(
        `Gemini transcription (${model}) failed: ${this.formatError(error)}`,
      );
      throw error;
    }
  }

  async runWebSearchBrief(
    params: WebSearchParams,
  ): Promise<{ text: string; usage?: { inputTokens: number; outputTokens: number } }> {
    const ai = this.createGenAiClient();
    const model = this.resolveChatModelId(params.model);

    try {
      const response = await ai.models.generateContent({
        model,
        contents: params.prompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const text = (response.text ?? '').trim();
      const usageMeta = response.usageMetadata;
      return {
        text,
        usage: usageMeta
          ? {
              inputTokens: usageMeta.promptTokenCount ?? 0,
              outputTokens: usageMeta.candidatesTokenCount ?? 0,
            }
          : undefined,
      };
    } catch (error) {
      throw new Error(`Gemini web search failed: ${this.formatError(error)}`);
    }
  }

  private formatError(error: unknown): string {
    if (error instanceof Error) {
      const maybe = error as Error & { status?: number; code?: string };
      return JSON.stringify({
        name: maybe.name,
        message: maybe.message,
        status: maybe.status,
        code: maybe.code,
      });
    }
    return String(error ?? 'unknown');
  }
}
