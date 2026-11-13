import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service';
import {
  LlmProvider,
  NodeMediaSourceType,
  type WorkflowNodeConfig,
} from '../schemas/workflow-node.schema';
import type {
  NodeExecutionInput,
  NodeExecutionResult,
  TranscriptionInput,
} from '../types/node-execution.types';
import { resolveNodeModel } from '../provider-default-model.util';

/** Whisper / audio transcription — uses audio APIs, not chat completions. */
const MAX_WHISPER_FILE_BYTES = 25 * 1024 * 1024;

type NormalizedTranscriptionConfig = {
  provider?: LlmProvider;
  model: string;
  sourceType: NodeMediaSourceType;
  sourceUrl: string;
  language?: string;
};

function normalizeTranscriptionConfig(
  config: WorkflowNodeConfig | undefined,
): NormalizedTranscriptionConfig {
  const c = config ?? {};
  const sourceType =
    c.sourceType === NodeMediaSourceType.Video
      ? NodeMediaSourceType.Video
      : NodeMediaSourceType.Audio;
  const sourceUrl = typeof c.sourceUrl === 'string' ? c.sourceUrl : '';
  const languageRaw = typeof c.language === 'string' ? c.language.trim() : '';
  const provider =
    c.provider && Object.values(LlmProvider).includes(c.provider)
      ? c.provider
      : undefined;
  return {
    provider,
    model: resolveNodeModel(c.model, provider, 'transcription'),
    sourceType,
    sourceUrl,
    language:
      languageRaw && languageRaw.toLowerCase() !== 'auto'
        ? languageRaw
        : undefined,
  };
}

function inferMimeType(
  sourceType: NodeMediaSourceType,
  fileName: string,
): string {
  const lower = fileName.toLowerCase();
  if (sourceType === NodeMediaSourceType.Audio) {
    if (lower.endsWith('.wav')) return 'audio/wav';
    if (lower.endsWith('.m4a')) return 'audio/mp4';
    if (lower.endsWith('.ogg')) return 'audio/ogg';
    return 'audio/mpeg';
  }
  if (lower.endsWith('.mov')) return 'video/quicktime';
  if (lower.endsWith('.webm')) return 'video/webm';
  return 'video/mp4';
}

function fileNameFromUrl(
  urlString: string,
  sourceType: NodeMediaSourceType,
): string {
  try {
    const url = new URL(urlString);
    const candidate = decodeURIComponent(url.pathname.split('/').pop() || '');
    if (candidate) return candidate;
  } catch {
    // Ignore and fallback.
  }
  return sourceType === NodeMediaSourceType.Audio
    ? 'transcription-source.mp3'
    : 'transcription-source.mp4';
}

/**
 * Resolve the media URL to transcribe: `config.sourceUrl` wins; otherwise fall
 * back to an upstream video URL (e.g. video_presenter -> transcription), in
 * which case sourceType becomes video. Pure helper (no network / AI).
 */
export function resolveTranscriptionSource(
  config: WorkflowNodeConfig | undefined,
  previousOutputs: TranscriptionInput['previousOutputs'] | undefined,
): WorkflowNodeConfig {
  const c = config ?? {};
  const explicit = typeof c.sourceUrl === 'string' ? c.sourceUrl.trim() : '';
  if (explicit) return { ...c, sourceUrl: explicit };
  const video = previousOutputs?.video?.trim();
  if (video && /^https?:\/\//i.test(video)) {
    return { ...c, sourceUrl: video, sourceType: NodeMediaSourceType.Video };
  }
  return c;
}

@Injectable()
export class TranscriptionService {
  constructor(private readonly llm: LlmService) {}

  private async downloadSource(
    sourceUrl: string,
  ): Promise<{ buffer: Buffer; contentLength?: number }> {
    if (sourceUrl.startsWith('s3://')) {
      throw new UnprocessableEntityException(
        's3:// source URLs are not supported yet in TranscriptionService. Provide an https URL or wire a storage adapter.',
      );
    }
    let parsed: URL;
    try {
      parsed = new URL(sourceUrl);
    } catch {
      throw new UnprocessableEntityException(
        'Transcription sourceUrl must be a valid absolute URL',
      );
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new UnprocessableEntityException(
        `Unsupported sourceUrl protocol "${parsed.protocol}" for transcription`,
      );
    }

    const response = await fetch(parsed.toString());
    if (!response.ok) {
      throw new UnprocessableEntityException(
        `Could not download transcription source (${response.status} ${response.statusText})`,
      );
    }
    const contentLengthHeader = response.headers.get('content-length');
    const contentLength = contentLengthHeader
      ? Number(contentLengthHeader)
      : undefined;
    if (
      typeof contentLength === 'number' &&
      Number.isFinite(contentLength) &&
      contentLength > MAX_WHISPER_FILE_BYTES
    ) {
      const sizeMb = (contentLength / (1024 * 1024)).toFixed(1);
      throw new UnprocessableEntityException(
        `Audio file is ${sizeMb}MB. Maximum supported size is 25MB.`,
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.byteLength > MAX_WHISPER_FILE_BYTES) {
      const sizeMb = (buffer.byteLength / (1024 * 1024)).toFixed(1);
      throw new UnprocessableEntityException(
        `Audio file is ${sizeMb}MB. Maximum supported size is 25MB.`,
      );
    }
    return { buffer, contentLength };
  }

  async transcribe(
    input: TranscriptionInput,
  ): Promise<{ transcription: string; audioDurationSeconds: number }> {
    const { config } = input;
    const normalized = normalizeTranscriptionConfig(config);
    if (!normalized.sourceUrl) {
      throw new UnprocessableEntityException(
        'Transcription requires `config.sourceUrl` (audio/video https URL) or an upstream video step',
      );
    }

    const { buffer } = await this.downloadSource(normalized.sourceUrl);
    const audioDurationSeconds = Math.max(
      1,
      Math.round(buffer.byteLength / 16_000),
    );
    const fileName = fileNameFromUrl(
      normalized.sourceUrl,
      normalized.sourceType,
    );
    const mimeType = inferMimeType(normalized.sourceType, fileName);

    const transcription = await this.llm.transcribeMedia({
      provider: normalized.provider,
      fileBuffer: buffer,
      fileName,
      mimeType,
      model: normalized.model,
      language: normalized.language,
    });

    return {
      transcription: transcription.trim(),
      audioDurationSeconds,
    };
  }

  async execute(input: NodeExecutionInput): Promise<NodeExecutionResult> {
    if (!input.rule) {
      throw new UnprocessableEntityException(
        'Transcription requires `rule` on NodeExecutionInput',
      );
    }

    const { transcription, audioDurationSeconds } = await this.transcribe({
      rule: input.rule,
      contentPrompt: input.contentPrompt ?? '',
      previousOutputs: input.previousOutputs ?? {},
      config: resolveTranscriptionSource(input.config, input.previousOutputs),
    });

    return {
      output: transcription,
      transcription,
      audioDurationSeconds,
    };
  }
}
