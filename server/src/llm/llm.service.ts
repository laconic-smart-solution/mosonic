import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOllama } from '@langchain/ollama';
import { ChatOpenAI } from '@langchain/openai';
import OpenAI from 'openai';
import {
  type WorkflowNodeLlmConfigSubset,
  LlmProvider,
  WorkflowNodeType,
} from '../nodes/workflow-node-llm.enums';
import {
  allowedOpenAiImageSizesForModel,
  coerceOpenAiImageSize,
  isValidOpenAiImageSizeForModel,
} from '../nodes/openai-image-size.util';
import { mirrorFileServiceArtifactToPublicUploadsUrl } from '../upload/file-service-local-mirror.util';

const DEFAULT_OPENAI_MODEL = 'gpt-4o';
const DEFAULT_ANTHROPIC_MODEL = 'claude-3-5-sonnet-latest';
const DEFAULT_GOOGLE_MODEL = 'gemini-1.5-pro';
const DEFAULT_GROQ_MODEL = 'llama-3.3-70b-versatile';
const DEFAULT_OLLAMA_MODEL = 'llama3.1';
const DEFAULT_FILE_SERVICE_UPLOAD_PATH = '/upload';

type LlmCapability =
  | 'chat'
  | 'image_generation'
  | 'video_generation'
  | 'transcription'
  | 'vision_describe';

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
    image_generation: false,
    video_generation: false,
    transcription: false,
    vision_describe: false,
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

  constructor(private readonly config: ConfigService) {}

  private resolveProvider(requested?: string): LlmProvider {
    const normalized = requested?.trim().toLowerCase();
    if (
      normalized &&
      (Object.values(LlmProvider) as string[]).includes(normalized)
    ) {
      return normalized as LlmProvider;
    }
    const fromEnv = this.config
      .get<string>('LLM_PROVIDER')
      ?.trim()
      .toLowerCase();
    if (fromEnv && (Object.values(LlmProvider) as string[]).includes(fromEnv)) {
      return fromEnv as LlmProvider;
    }
    return LlmProvider.OpenAI;
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
      [WorkflowNodeType.VideoGeneration]: 'video_generation',
      [WorkflowNodeType.Transcription]: 'transcription',
      [WorkflowNodeType.Adapt]: 'chat',
      [WorkflowNodeType.Intelligence]: 'chat',
    };
    const capability = capabilityByNodeType[type];
    if (capability) {
      this.assertProviderCapability(provider, capability);
    }
    if (type === WorkflowNodeType.ImageGeneration && config) {
      const rec = config as Record<string, unknown>;
      const model =
        typeof rec.model === 'string' && rec.model.trim()
          ? rec.model.trim()
          : 'gpt-image-1';
      const sizeRaw =
        typeof rec.size === 'string' && rec.size.trim()
          ? rec.size.trim()
          : '';
      if (
        sizeRaw &&
        !isValidOpenAiImageSizeForModel(sizeRaw, model)
      ) {
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
   * Returns a configured OpenAI chat model. Throws if OPENAI_API_KEY is not set
   * (callers that need the model should handle or propagate). Does not call the API.
   *
   * Model resolution: `options.model` (e.g. workflow node `config.model`) →
   * `OPENAI_MODEL` env → built-in default.
   */
  getChatModel(options?: {
    provider?: string;
    model?: string;
    /** Default 0.3. Use ~0.55 for workflow planning for more varied JSON plans. */
    temperature?: number;
  }): BaseChatModel {
    const provider = this.resolveProvider(options?.provider);
    this.assertProviderCapability(provider, 'chat');
    const temperature =
      typeof options?.temperature === 'number' ? options.temperature : 0.3;

    if (provider === LlmProvider.OpenAI) {
      const apiKey = this.requireApiKeyForProvider(provider);
      const model =
        this.config.get<string>('OPENAI_MODEL')?.trim() || DEFAULT_OPENAI_MODEL;
      return new ChatOpenAI({
        apiKey,
        model,
        temperature,
        modelKwargs: {
          response_format: { type: 'json_object' },
        },
      });
    }
    if (provider === LlmProvider.Anthropic) {
      const apiKey = this.requireApiKeyForProvider(provider);
      const model =
        this.config.get<string>('ANTHROPIC_MODEL')?.trim() ||
        DEFAULT_ANTHROPIC_MODEL;
      return new ChatAnthropic({ apiKey, model, temperature });
    }
    if (provider === LlmProvider.Google) {
      const apiKey = this.requireApiKeyForProvider(provider);
      const model =
        this.config.get<string>('GOOGLE_MODEL')?.trim() || DEFAULT_GOOGLE_MODEL;
      return new ChatGoogleGenerativeAI({ apiKey, model, temperature });
    }
    if (provider === LlmProvider.Groq) {
      const apiKey = this.requireApiKeyForProvider(provider);
      const model =
        this.config.get<string>('GROQ_MODEL')?.trim() || DEFAULT_GROQ_MODEL;
      return new ChatOpenAI({
        apiKey,
        model,
        configuration: { baseURL: 'https://api.groq.com/openai/v1' },
        temperature,
      });
    }

    const model =
      this.config.get<string>('OLLAMA_MODEL')?.trim() || DEFAULT_OLLAMA_MODEL;
    return new ChatOllama({
      model,
      temperature,
      baseUrl: this.config.get<string>('OLLAMA_BASE_URL')?.trim() || undefined,
      format: 'json',
    });
  }

  /**
   * Chat model without JSON mode — for preprocessing steps that must return plain text.
   */
  getChatModelForPlainText(options?: {
    provider?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }): BaseChatModel {
    const provider = this.resolveProvider(options?.provider);
    this.assertProviderCapability(provider, 'chat');
    const temperature =
      typeof options?.temperature === 'number' ? options.temperature : 0.2;
    const maxTokens =
      typeof options?.maxTokens === 'number' ? options.maxTokens : undefined;
    if (provider === LlmProvider.OpenAI) {
      const apiKey = this.requireApiKeyForProvider(provider);
      const model =
        this.config.get<string>('OPENAI_MODEL')?.trim() || DEFAULT_OPENAI_MODEL;
      return new ChatOpenAI({
        apiKey,
        model,
        temperature,
        ...(maxTokens !== undefined ? { maxTokens } : {}),
      });
    }
    if (provider === LlmProvider.Anthropic) {
      const apiKey = this.requireApiKeyForProvider(provider);
      const model =
        this.config.get<string>('ANTHROPIC_MODEL')?.trim() ||
        DEFAULT_ANTHROPIC_MODEL;
      return new ChatAnthropic({
        apiKey,
        model,
        temperature,
        ...(maxTokens !== undefined ? { maxTokens } : {}),
      });
    }
    if (provider === LlmProvider.Google) {
      const apiKey = this.requireApiKeyForProvider(provider);
      const model =
        this.config.get<string>('GOOGLE_MODEL')?.trim() || DEFAULT_GOOGLE_MODEL;
      return new ChatGoogleGenerativeAI({
        apiKey,
        model,
        temperature,
        ...(maxTokens !== undefined ? { maxOutputTokens: maxTokens } : {}),
      });
    }
    if (provider === LlmProvider.Groq) {
      const apiKey = this.requireApiKeyForProvider(provider);
      const model =
        this.config.get<string>('GROQ_MODEL')?.trim() || DEFAULT_GROQ_MODEL;
      return new ChatOpenAI({
        apiKey,
        model,
        configuration: { baseURL: 'https://api.groq.com/openai/v1' },
        temperature,
        ...(maxTokens !== undefined ? { maxTokens } : {}),
      });
    }
    const model =
      this.config.get<string>('OLLAMA_MODEL')?.trim() || DEFAULT_OLLAMA_MODEL;
    return new ChatOllama({
      model,
      temperature,
      numPredict: maxTokens,
      baseUrl: this.config.get<string>('OLLAMA_BASE_URL')?.trim() || undefined,
    });
  }

  /**
   * OCR / describe image content for rule extraction preprocessing (vision models).
   */
  async describeImageForExtraction(
    buffer: Buffer,
    mimeType: string,
    options?: { provider?: string; model?: string },
  ): Promise<string> {
    const provider = this.resolveProvider(options?.provider);
    this.assertProviderCapability(provider, 'vision_describe');
    const model = this.getChatModelForPlainText({
      provider,
      model: options?.model,
    });
    const b64 = buffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${b64}`;
    const res = await model.invoke([
      new SystemMessage(
        'Transcribe any visible text in the image accurately. Briefly summarize non-text visual elements only if they help marketing context. Output plain text only, no JSON.',
      ),
      new HumanMessage({
        content: [
          {
            type: 'text',
            text: 'Extract all readable text and a short note on visuals if relevant for a marketing strategy document.',
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

  /**
   * DALL-E image generation (non-streaming). Returns base64 payload
   * (`response_format: b64_json`) for downstream storage.
   */
  async generateImageBase64(params: {
    provider?: string;
    model: string;
    prompt: string;
    size: NonNullable<OpenAI.Images.ImageGenerateParams['size']>;
    quality: 'standard' | 'hd';
    style: 'natural' | 'vivid';
  }): Promise<{ base64: string; mimeType: string }> {
    try {
      const provider = this.resolveProvider(params.provider);
      this.assertProviderCapability(provider, 'image_generation');
      const apiKey = this.requireApiKeyForProvider(provider);
      const client = new OpenAI({ apiKey });
      const requestedModel = (params.model ?? '').trim();
      const model = requestedModel || 'gpt-image-2';
      const isDalle3 = model === 'dall-e-3';

      const body: OpenAI.Images.ImageGenerateParamsNonStreaming = {
        model,
        prompt: params.prompt,
        size: coerceOpenAiImageSize(String(params.size), model) as NonNullable<
          OpenAI.Images.ImageGenerateParams['size']
        >,
        n: 1,
        response_format: 'b64_json',
      };
      // DALL·E 3 historically accepted `style`; current Images API rejects it
      // ("Unknown parameter: 'style'"). Style is already reflected in the prompt text.
      if (isDalle3) {
        body.quality = params.quality;
      }

      const callWithCompat = async (
        req: OpenAI.Images.ImageGenerateParamsNonStreaming,
      ): Promise<OpenAI.Images.ImagesResponse> => {
        try {
          return await client.images.generate(req);
        } catch (error: unknown) {
          const msg = this.formatError(error);
          // Some gateways / older endpoints reject `response_format`.
          if (msg.includes("Unknown parameter: 'response_format'")) {
            const without = { ...req };
            delete (without as { response_format?: unknown }).response_format;
            return await client.images.generate(without);
          }
          throw error;
        }
      };

      let response: OpenAI.Images.ImagesResponse;
      try {
        response = await callWithCompat(body);
      } catch (error: unknown) {
        // Back-compat: some environments don't recognize `dall-e-3` even when configured.
        const msg = this.formatError(error);
        if (
          model === 'dall-e-3' &&
          (msg.includes("model 'dall-e-3' does not exist") ||
            msg.includes('does not exist') ||
            msg.includes('invalid_value'))
        ) {
          const fallbackBody: OpenAI.Images.ImageGenerateParamsNonStreaming = {
            model: 'gpt-image-1',
            prompt: params.prompt,
            size: coerceOpenAiImageSize(params.size, 'gpt-image-1'),
            n: 1,
            response_format: 'b64_json',
          };
          response = await callWithCompat(fallbackBody);
        } else {
          throw error;
        }
      }

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
            `Image generation returned URL but download failed (${res.status})`,
          );
        }
        const mimeType =
          res.headers.get('content-type')?.split(';')[0]?.trim() || 'image/png';
        const buf = Buffer.from(await res.arrayBuffer());
        return { base64: buf.toString('base64'), mimeType };
      }

      throw new Error('Image generation returned no base64 payload');
    } catch (error) {
      this.logger.error(
        `OpenAI image generation failed: ${this.formatError(error)}`,
      );
      throw error;
    }
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
        fileUrl: data.fileUrl,
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

  /**
   * Whisper transcription from in-memory media bytes.
   */
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
    const apiKey = this.requireApiKeyForProvider(provider);
    const client =
      provider === LlmProvider.Groq
        ? new OpenAI({
            apiKey,
            baseURL: 'https://api.groq.com/openai/v1',
          })
        : new OpenAI({ apiKey });
    const bytes = Uint8Array.from(params.fileBuffer);
    const file = new File([bytes], params.fileName, {
      type: params.mimeType,
    });
    const response = await client.audio.transcriptions.create({
      model:
        provider === LlmProvider.Groq ? 'whisper-large-v3-turbo' : 'whisper-1',
      file,
      language: params.language?.trim() || undefined,
      prompt: params.prompt?.trim() || undefined,
      response_format: 'text',
    });
    return typeof response === 'string' ? response : String(response);
  }

  /**
   * OpenAI Responses API with built-in web_search for intelligence nodes.
   */
  async runWebSearchBrief(params: {
    prompt: string;
    model?: string;
    provider?: string;
  }): Promise<{
    text: string;
    usage?: { inputTokens: number; outputTokens: number };
  }> {
    const provider = this.resolveProvider(params.provider);
    this.assertProviderCapability(provider, 'chat');
    if (provider !== LlmProvider.OpenAI) {
      throw new Error(
        'Web search intelligence requires OpenAI (Responses API web_search tool)',
      );
    }
    const apiKey = this.requireApiKeyForProvider(provider);
    const client = new OpenAI({ apiKey });
    const model =
      params.model?.trim() ||
      this.config.get<string>('OPENAI_MODEL')?.trim() ||
      DEFAULT_OPENAI_MODEL;

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
      throw new Error(
        `OpenAI web search failed: ${this.formatError(error)}`,
      );
    }
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
