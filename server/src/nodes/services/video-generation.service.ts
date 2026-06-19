import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { EventsService } from '../../events/events.service';
import { LlmService } from '../../llm/llm.service';
import type { Rule } from '../../rule/schemas/rule.schema';
import { LlmProvider } from '../schemas/workflow-node.schema';
import type {
  NodeExecutionInput,
  NodeExecutionResult,
  VideoGenerationInput,
} from '../types/node-execution.types';
import { mirrorFileServiceArtifactToPublicUploadsUrl } from '../../upload/file-service-local-mirror.util';
import { fetchUrlToBuffer } from '../../upload/fetch-url-to-buffer.util';
import { uploadBufferToFileService } from '../../upload/file-service-upload.util';
import type { WorkflowNodeConfig } from '../schemas/workflow-node.schema';
import {
  HeygenAssetsService,
  heygenCallbackId,
  type HeygenVideoStatus,
} from './heygen-assets.service';
import { PRESENTER_WORDS_PER_SECOND } from './presenter-script.util';
import {
  ScriptDurationService,
  type ScriptFitMethod,
} from './script-duration.service';

/** Inline execution poll (deprecated path when queue is off). */
const INLINE_POLL_INTERVAL_MS = 5000;
const INLINE_VIDEO_TIMEOUT_MS = 30 * 60 * 1000;

export type VideoJobStatus = 'processing' | 'completed' | 'failed';

export type VideoJobProvider = 'sora' | 'heygen';

export type PresenterScriptMeta = {
  wordCount: number;
  method: ScriptFitMethod;
};

export interface VideoSubmitResult {
  externalJobId: string;
  estimatedSeconds: number;
  normalized: NormalizedVideoConfig;
  videoProvider?: VideoJobProvider;
  presenterScriptMeta?: PresenterScriptMeta;
}

export interface VideoCheckResult {
  status: VideoJobStatus;
  error?: string;
}

export interface VideoCompleteResult {
  video: string;
  storage: NonNullable<NodeExecutionResult['video']>;
  videoCost: NonNullable<NodeExecutionResult['videoCost']>;
}

/** OpenAI Sora `seconds` parameter — only these values are valid. */
export const SORA_VIDEO_DURATIONS = [4, 8, 12, 16, 20] as const;
export type SoraVideoDuration = (typeof SORA_VIDEO_DURATIONS)[number];

export function normalizeSoraDurationSeconds(
  raw: number | undefined,
): SoraVideoDuration {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : 8;
  let best: SoraVideoDuration = SORA_VIDEO_DURATIONS[0];
  let bestDiff = Math.abs(n - best);
  for (const s of SORA_VIDEO_DURATIONS) {
    const d = Math.abs(n - s);
    if (d < bestDiff) {
      best = s;
      bestDiff = d;
    }
  }
  return best;
}

export const PRESENTER_VIDEO_DURATIONS = [10, 20, 30, 40, 60] as const;
export type PresenterVideoDuration = (typeof PRESENTER_VIDEO_DURATIONS)[number];

export function normalizePresenterDurationSeconds(
  raw: number | undefined,
): PresenterVideoDuration {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : 20;
  let best: PresenterVideoDuration = PRESENTER_VIDEO_DURATIONS[1];
  let bestDiff = Math.abs(n - best);
  for (const s of PRESENTER_VIDEO_DURATIONS) {
    const d = Math.abs(n - s);
    if (d < bestDiff) {
      best = s;
      bestDiff = d;
    }
  }
  return best;
}

/** Global Sora prompt constraints — no on-screen text, logos, or contact details. */
export const VIDEO_OUTPUT_GUARDRAILS = [
  'No on-screen text of any kind: no captions, subtitles, titles, labels, typography, or readable words.',
  'No logos, brand marks, watermarks, app UI, or end cards unless explicitly provided as a reference asset.',
  'No phone numbers, email addresses, physical addresses, URLs, QR codes, social handles, or other contact information.',
  'Do not invent or display prices, dates, legal claims, or contact details that are not in the brief.',
  'No spoken words, voiceover, or lip-synced dialogue.',
  'Visual storytelling only; contact and CTA belong in post copy, not burned into the video.',
] as const;

export type NormalizedVideoConfig = {
  provider?: LlmProvider;
  model: string;
  duration: number;
  resolution: string;
  aspectRatio: string;
  negativePrompt?: string;
  secondsForApi: OpenAI.Videos.VideoCreateParams['seconds'];
  sizeForApi: OpenAI.Videos.VideoCreateParams['size'];
};

export function normalizeVideoConfig(
  config: NodeExecutionInput['config'],
): NormalizedVideoConfig {
  const c = config ?? {};
  const durationVal = (c as Record<string, unknown>).duration;
  const durationRaw =
    typeof durationVal === 'number'
      ? durationVal
      : typeof durationVal === 'string' && durationVal.trim()
        ? Number(durationVal)
        : 8;
  const duration = normalizeSoraDurationSeconds(
    Number.isFinite(durationRaw) ? durationRaw : undefined,
  );
  const resolution = typeof c.resolution === 'string' ? c.resolution : '720p';
  const aspectRatio =
    typeof c.aspectRatio === 'string' ? c.aspectRatio : '16:9';
  const provider =
    c.provider && Object.values(LlmProvider).includes(c.provider)
      ? c.provider
      : undefined;
  const requestedModel = typeof c.model === 'string' ? c.model.trim() : '';
  const allowedModels = new Set([
    'sora-2',
    'sora-2-pro',
    'sora-2-2025-10-06',
    'sora-2-pro-2025-10-06',
    'sora-2-2025-12-08',
  ]);
  const model = allowedModels.has(requestedModel) ? requestedModel : 'sora-2';
  const isSoraPro = model.includes('pro');

  const secondsForApi = String(
    duration,
  ) as OpenAI.Videos.VideoCreateParams['seconds'];

  /** sora-2 (non-pro) only accepts 720x1280 and 1280x720 per OpenAI API. */
  const sizeForApi: OpenAI.Videos.VideoCreateParams['size'] = (() => {
    const wantsHd = resolution === '1080p' && isSoraPro;
    const portrait =
      aspectRatio === '9:16' ||
      aspectRatio === '4:5' ||
      aspectRatio === '1:1';
    if (portrait) {
      return wantsHd ? '1024x1792' : '720x1280';
    }
    if (aspectRatio === '16:9') {
      return wantsHd ? '1792x1024' : '1280x720';
    }
    return wantsHd ? '1024x1792' : '720x1280';
  })();

  const negativePrompt =
    typeof c.negativePrompt === 'string' && c.negativePrompt.trim()
      ? c.negativePrompt.trim()
      : undefined;

  return {
    provider,
    model,
    duration,
    resolution,
    aspectRatio,
    negativePrompt,
    secondsForApi,
    sizeForApi,
  };
}

export function buildVideoPrompt(
  rule: Rule,
  previousOutputs: { text?: string; image?: string },
  config: NormalizedVideoConfig,
): string {
  return [
    'Create a short marketing video for the following content:',
    `"${previousOutputs.text ?? ''}"`,
    '',
    previousOutputs.image
      ? `Match the visual style of this reference image: ${previousOutputs.image}`
      : '',
    `Brand: ${rule.brand.brandName}`,
    `Industry: ${rule.brand.industry}`,
    `Brand description: ${rule.brand.brandDescription}`,
    `Visual tone: ${rule.brand.brandTone.join(', ')}`,
    '',
    `Target audience: ${rule.audience.description}`,
    `Location: ${rule.audience.location.join(', ')}`,
    '',
    `Distribution channels: ${rule.channels.map((c) => c.channel).join(', ')}`,
    config.aspectRatio === '9:16' || config.aspectRatio === '4:5'
      ? 'Vertical format — optimized for mobile stories and reels.'
      : config.aspectRatio === '1:1'
        ? 'Square format — optimized for feed posts.'
        : 'Horizontal format — optimized for desktop and YouTube.',
    '',
    `Duration: ${config.duration} seconds`,
    `Resolution: ${config.resolution}`,
    '',
    `Visual style: ${rule.brand.brandTone.join(', ')}`,
    'Professional marketing quality.',
    'Smooth transitions, no abrupt cuts.',
    'Cinematic and engaging throughout.',
    '',
    rule.contentGuidelines.donts.length
      ? `Avoid: ${rule.contentGuidelines.donts.join(', ')}`
      : '',
    rule.contentGuidelines.requiredElements.length
      ? `Must include feel of: ${rule.contentGuidelines.requiredElements.join(', ')}`
      : '',
    '',
    '=== VIDEO OUTPUT CONSTRAINTS (mandatory) ===',
    ...VIDEO_OUTPUT_GUARDRAILS,
    config.negativePrompt
      ? `Additionally avoid: ${config.negativePrompt}`
      : '',
    'Professional marketing video quality.',
  ]
    .filter(Boolean)
    .join('\n');
}

export type VideoGenerationMode = 'cinematic' | 'presenter';

export function getVideoGenerationMode(
  config: WorkflowNodeConfig | undefined,
): VideoGenerationMode {
  const mode = config?.mode?.trim();
  return mode === 'presenter' ? 'presenter' : 'cinematic';
}

export function buildPresenterScript(
  previousOutputs: VideoGenerationInput['previousOutputs'],
  contentPrompt: string,
): string {
  const script =
    previousOutputs.adaptedCaption?.trim() ??
    previousOutputs.text?.trim() ??
    contentPrompt?.trim() ??
    '';
  if (!script) {
    throw new UnprocessableEntityException(
      'Presenter video requires upstream text (adapt or text generation) or a content prompt',
    );
  }
  return script;
}

export function mapHeygenVideoStatus(status: HeygenVideoStatus): VideoJobStatus {
  if (status === 'completed') return 'completed';
  if (status === 'failed') return 'failed';
  return 'processing';
}

export function mapOpenAiVideoStatus(
  status: OpenAI.Videos.Video['status'],
): VideoJobStatus {
  if (status === 'completed') {
    return 'completed';
  }
  if (status === 'failed') {
    return 'failed';
  }
  return 'processing';
}

@Injectable()
export class VideoGenerationService {
  private readonly logger = new Logger(VideoGenerationService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly llm: LlmService,
    private readonly events: EventsService,
    private readonly heygen: HeygenAssetsService,
    private readonly scriptDuration: ScriptDurationService,
  ) {}

  private getOpenAiClient(provider?: LlmProvider): OpenAI {
    const resolvedProvider = provider ?? LlmProvider.OpenAI;
    try {
      this.llm.assertProviderCapability(resolvedProvider, 'video_generation');
    } catch (error) {
      throw new UnprocessableEntityException(
        error instanceof Error ? error.message : 'Unsupported video provider',
      );
    }

    const apiKey = this.configService.get<string>('OPENAI_API_KEY')?.trim();
    if (!apiKey) {
      throw new UnprocessableEntityException('OPENAI_API_KEY is not set');
    }
    return new OpenAI({ apiKey });
  }

  private getFileServiceUploadUrl(): string {
    const baseUrl = this.configService.get<string>('FILE_SERVICE_URL')?.trim();
    if (!baseUrl) {
      throw new UnprocessableEntityException(
        'FILE_SERVICE_URL is not set; required for video storage upload',
      );
    }
    return `${baseUrl.replace(/\/+$/, '')}/upload`;
  }

  async emitProcessing(
    pipelineId: string,
    nodeId: string,
    message: string,
  ): Promise<void> {
    try {
      this.events.emitToPipeline(pipelineId, 'node:processing', {
        pipelineId,
        nodeId,
        message,
      });
    } catch {
      // noop
    }
  }

  private async uploadVideoBuffer(params: {
    videoBuffer: Buffer;
    fileName: string;
    folderPath: string;
  }): Promise<{
    fileUrl: string;
    relativePath: string;
    storedFileName: string;
    originalFileName?: string;
  }> {
    const uploadUrl = this.getFileServiceUploadUrl();
    const attemptUpload = async (mimeType: string) => {
      const form = new FormData();
      const blob = new Blob([Uint8Array.from(params.videoBuffer)], {
        type: mimeType,
      });
      form.append('file', blob, params.fileName);
      form.append('folderPath', params.folderPath);

      const response = await fetch(uploadUrl, {
        method: 'POST',
        body: form,
      });
      if (response.status !== 201) {
        const responseBody = await response.text().catch(() => '');
        throw new Error(
          `Video upload failed with status ${response.status}: ${response.statusText}${responseBody ? ` | body=${responseBody}` : ''}`,
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
        throw new Error('Video upload returned malformed response envelope');
      }
      return {
        fileUrl: data.fileUrl,
        relativePath: data.relativePath,
        storedFileName: data.storedFileName ?? params.fileName,
        originalFileName: data.originalFileName,
      };
    };

    try {
      const result = await attemptUpload('video/mp4');
      return await this.maybeMirrorVideoUploadToPublicUploads(result, 'video/mp4');
    } catch (error) {
      if (error instanceof Error && error.message.includes('status 400')) {
        const result = await attemptUpload('application/octet-stream');
        return await this.maybeMirrorVideoUploadToPublicUploads(
          result,
          'application/octet-stream',
        );
      }
      throw error;
    }
  }

  private async maybeMirrorVideoUploadToPublicUploads(
    result: {
      fileUrl: string;
      relativePath: string;
      storedFileName: string;
      originalFileName?: string;
    },
    mimeType: string,
  ): Promise<{
    fileUrl: string;
    relativePath: string;
    storedFileName: string;
    originalFileName?: string;
  }> {
    const base = this.configService.get<string>('FILE_SERVICE_URL')?.trim();
    if (!base) return result;
    try {
      const mirrored = await mirrorFileServiceArtifactToPublicUploadsUrl(
        this.configService,
        base.replace(/\/+$/, ''),
        { fileUrl: result.fileUrl, relativePath: result.relativePath },
        result.storedFileName,
        mimeType,
      );
      if (mirrored) {
        return { ...result, fileUrl: mirrored };
      }
    } catch {
      // Keep file-service URL if mirror fails
    }
    return result;
  }

  private assertPresenterConfig(
    config: WorkflowNodeConfig,
  ): {
    avatarId: string;
    voiceId: string;
    orientation: 'landscape' | 'portrait';
    expressiveness: 'low' | 'medium' | 'high';
    motionPrompt?: string;
    removeBackground: boolean;
    backgroundAssetId?: string;
    durationSeconds: number;
  } {
    const avatarId = config.heygenAvatarId?.trim();
    const voiceId = config.heygenVoiceId?.trim();
    if (!avatarId) {
      throw new UnprocessableEntityException(
        'Presenter mode requires an avatar photo. Upload one in node settings.',
      );
    }
    if (!voiceId) {
      throw new UnprocessableEntityException(
        'Presenter mode requires a voice. Select one in node settings.',
      );
    }
    const orientation =
      config.heygenOrientation === 'portrait' ? 'portrait' : 'landscape';
    const expressiveness =
      config.heygenExpressiveness === 'low' ||
      config.heygenExpressiveness === 'high'
        ? config.heygenExpressiveness
        : 'medium';
    const durationSeconds = normalizePresenterDurationSeconds(config.duration);
    return {
      avatarId,
      voiceId,
      orientation,
      expressiveness,
      motionPrompt: config.heygenMotionPrompt?.trim() || undefined,
      removeBackground: config.removeBackground !== false,
      backgroundAssetId: config.heygenBackgroundAssetId?.trim() || undefined,
      durationSeconds,
    };
  }

  /** Phase 1: submit HeyGen presenter video (webhook + poll fallback). */
  async submitPresenterVideoJob(
    input: VideoGenerationInput & { pipelineId: string; nodeId: string },
  ): Promise<VideoSubmitResult> {
    const config = (input.config ?? {}) as WorkflowNodeConfig;
    const presenter = this.assertPresenterConfig(config);
    const rawScript = buildPresenterScript(
      input.previousOutputs ?? {},
      input.contentPrompt ?? '',
    );

    const { script, wordCount, method } =
      await this.scriptDuration.fitScriptToDuration(
        rawScript,
        presenter.durationSeconds,
      );

    const approxSeconds = Math.round(wordCount / PRESENTER_WORDS_PER_SECOND);
    this.logger.log(
      `[VideoGen] presenter script: method=${method} words=${wordCount}`,
    );
    await this.emitProcessing(
      input.pipelineId,
      input.nodeId,
      `Script ready: ${wordCount} words, ~${approxSeconds}s (${method})`,
    );

    const { videoId } = await this.heygen.submitPresenterVideo({
      avatarId: presenter.avatarId,
      script,
      voiceId: presenter.voiceId,
      durationSeconds: presenter.durationSeconds,
      orientation: presenter.orientation,
      expressiveness: presenter.expressiveness,
      motionPrompt: presenter.motionPrompt,
      removeBackground: presenter.removeBackground,
      backgroundAssetId: presenter.backgroundAssetId,
      callbackUrl: this.heygen.resolveCallbackUrl(),
      callbackId: heygenCallbackId(input.pipelineId, input.nodeId),
    });

    return {
      externalJobId: videoId,
      estimatedSeconds: presenter.durationSeconds,
      normalized: normalizeVideoConfig(config),
      videoProvider: 'heygen',
      presenterScriptMeta: { wordCount, method },
    };
  }

  async checkHeyGenVideoJob(externalJobId: string): Promise<VideoCheckResult> {
    const result = await this.heygen.getVideoStatus(externalJobId);
    return {
      status: mapHeygenVideoStatus(result.status),
      error: result.error,
    };
  }

  async completeHeyGenVideoJob(
    externalJobId: string,
    input: VideoGenerationInput & {
      pipelineId: string;
      nodeId: string;
    },
  ): Promise<VideoCompleteResult> {
    const status = await this.heygen.getVideoStatus(externalJobId);
    if (status.status !== 'completed' || !status.videoUrl?.trim()) {
      throw new Error(
        status.error ?? 'HeyGen video is not ready or missing video_url',
      );
    }

    const { buffer } = await fetchUrlToBuffer(status.videoUrl.trim());
    const fileName = `${input.nodeId}.mp4`;
    const base = this.configService.get<string>('FILE_SERVICE_URL')?.trim();
    if (!base) {
      throw new UnprocessableEntityException(
        'FILE_SERVICE_URL is not set; required for video storage upload',
      );
    }
    const uploaded = await uploadBufferToFileService({
      fileServiceBase: base,
      buffer: new Uint8Array(buffer),
      originalName: fileName,
      mimeType: 'video/mp4',
      folderPath: `neural-tex/videos/${input.pipelineId}`,
    });
    const storage = await this.maybeMirrorVideoUploadToPublicUploads(
      {
        fileUrl: uploaded.fileUrl,
        relativePath: uploaded.relativePath,
        storedFileName: uploaded.storedFileName ?? fileName,
        originalFileName: uploaded.originalFileName,
      },
      'video/mp4',
    );

    const normalized = normalizeVideoConfig(input.config ?? {});
    return {
      video: storage.fileUrl,
      storage,
      videoCost: {
        model: 'heygen-presenter',
        videoSeconds: status.duration ?? normalized.duration,
        videoResolution: presenterResolutionLabel(
          (input.config ?? {}) as WorkflowNodeConfig,
        ),
      },
    };
  }

  async generatePresenterVideo(
    input: VideoGenerationInput & { pipelineId: string; nodeId: string },
  ): Promise<{ video: string; storage: NodeExecutionResult['video'] }> {
    const { pipelineId, nodeId } = input;
    const { externalJobId, estimatedSeconds } =
      await this.submitPresenterVideoJob(input);

    await this.emitProcessing(
      pipelineId,
      nodeId,
      'Presenter video generation started...',
    );

    const maxAttempts = INLINE_VIDEO_TIMEOUT_MS / INLINE_POLL_INTERVAL_MS;
    let attempts = 0;
    let check = await this.checkHeyGenVideoJob(externalJobId);

    while (check.status === 'processing') {
      if (attempts >= maxAttempts) {
        throw new Error('Presenter video generation timed out after 30 minutes.');
      }
      await new Promise((resolve) =>
        setTimeout(resolve, INLINE_POLL_INTERVAL_MS),
      );
      check = await this.checkHeyGenVideoJob(externalJobId);
      attempts += 1;
      await this.emitProcessing(
        pipelineId,
        nodeId,
        `Generating presenter video... (~${attempts * (INLINE_POLL_INTERVAL_MS / 1000)}s, est. ${estimatedSeconds}s)`,
      );
    }

    if (check.status === 'failed') {
      throw new Error(
        check.error ?? 'HeyGen presenter video failed. Please retry.',
      );
    }

    const completed = await this.completeHeyGenVideoJob(externalJobId, input);
    return { video: completed.video, storage: completed.storage };
  }

  /** Phase 1: submit Sora job and return external id (no polling). */
  async submitVideoJob(
    input: VideoGenerationInput & { pipelineId: string; nodeId: string },
  ): Promise<VideoSubmitResult> {
    const { rule, previousOutputs, config } = input;
    const sourceText = previousOutputs.text?.trim();
    if (!sourceText) {
      throw new UnprocessableEntityException(
        'Video generation requires `previousOutputs.text` from text_generation node',
      );
    }
    const normalized = normalizeVideoConfig(config);
    const prompt = buildVideoPrompt(
      rule,
      { text: sourceText, image: previousOutputs.image },
      normalized,
    );

    const client = this.getOpenAiClient(normalized.provider);
    const created = await client.videos.create({
      model: normalized.model,
      prompt,
      size: normalized.sizeForApi,
      seconds: normalized.secondsForApi,
    });

    return {
      externalJobId: created.id,
      estimatedSeconds: normalized.duration,
      normalized,
      videoProvider: 'sora',
    };
  }

  /** Phase 2: single status poll. */
  async checkVideoJob(
    externalJobId: string,
    provider?: LlmProvider,
  ): Promise<VideoCheckResult> {
    const client = this.getOpenAiClient(provider);
    const result = await client.videos.retrieve(externalJobId);
    const status = mapOpenAiVideoStatus(result.status);
    if (status === 'failed') {
      return {
        status,
        error:
          result.error?.message || 'Sora video generation failed. Please retry.',
      };
    }
    return { status };
  }

  /** Phase 2 completion: download from provider and upload to file service. */
  async completeVideoJob(
    externalJobId: string,
    input: VideoGenerationInput & {
      pipelineId: string;
      nodeId: string;
      normalized: NormalizedVideoConfig;
    },
  ): Promise<VideoCompleteResult> {
    const client = this.getOpenAiClient(input.normalized.provider);
    const videoResponse = await client.videos.downloadContent(externalJobId);
    if (!videoResponse.ok) {
      throw new Error(
        `Failed to download generated video (${videoResponse.status} ${videoResponse.statusText})`,
      );
    }
    const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
    const fileName = `${input.nodeId}.mp4`;
    const storage = await this.uploadVideoBuffer({
      videoBuffer,
      fileName,
      folderPath: `neural-tex/videos/${input.pipelineId}`,
    });

    return {
      video: storage.fileUrl,
      storage,
      videoCost: {
        model: input.normalized.model,
        videoSeconds: input.normalized.duration,
        videoResolution: input.normalized.resolution,
      },
    };
  }

  /**
   * Blocking path for inline orchestration (ORCHESTRATION_USE_QUEUE=false).
   */
  async generateVideo(
    input: VideoGenerationInput & { pipelineId: string; nodeId: string },
  ): Promise<{ video: string; storage: NodeExecutionResult['video'] }> {
    const { pipelineId, nodeId } = input;
    const { externalJobId, estimatedSeconds, normalized } =
      await this.submitVideoJob(input);

    await this.emitProcessing(
      pipelineId,
      nodeId,
      'Video generation started...',
    );

    const maxAttempts = INLINE_VIDEO_TIMEOUT_MS / INLINE_POLL_INTERVAL_MS;
    let attempts = 0;
    let check = await this.checkVideoJob(externalJobId, normalized.provider);

    while (check.status === 'processing') {
      if (attempts >= maxAttempts) {
        throw new Error('Video generation timed out after 30 minutes.');
      }
      await new Promise((resolve) =>
        setTimeout(resolve, INLINE_POLL_INTERVAL_MS),
      );
      check = await this.checkVideoJob(externalJobId, normalized.provider);
      attempts += 1;
      await this.emitProcessing(
        pipelineId,
        nodeId,
        `Generating video... (~${attempts * (INLINE_POLL_INTERVAL_MS / 1000)}s, est. ${estimatedSeconds}s)`,
      );
    }

    if (check.status === 'failed') {
      throw new Error(check.error ?? 'Sora video generation failed. Please retry.');
    }

    const completed = await this.completeVideoJob(externalJobId, {
      ...input,
      normalized,
    });
    return { video: completed.video, storage: completed.storage };
  }

  async execute(input: NodeExecutionInput): Promise<NodeExecutionResult> {
    if (!input.rule) {
      throw new UnprocessableEntityException(
        'Video generation requires `rule` on NodeExecutionInput',
      );
    }
    const config = (input.config ?? {}) as WorkflowNodeConfig;
    const execInput = {
      rule: input.rule,
      contentPrompt: input.contentPrompt ?? '',
      previousOutputs: input.previousOutputs ?? {},
      config,
      pipelineId: input.pipelineRef,
      nodeId: input.nodeId,
    };

    if (getVideoGenerationMode(config) === 'presenter') {
      const { video, storage } = await this.generatePresenterVideo(execInput);
      return {
        output: video,
        video: storage,
        videoCost: {
          model: 'heygen-presenter',
          videoSeconds: normalizePresenterDurationSeconds(config.duration),
          videoResolution: presenterResolutionLabel(config),
        },
      };
    }

    const normalized = normalizeVideoConfig(config);
    const { video, storage } = await this.generateVideo(execInput);
    return {
      output: video,
      video: storage,
      videoCost: {
        model: normalized.model,
        videoSeconds: normalized.duration,
        videoResolution: normalized.resolution,
      },
    };
  }
}

function presenterResolutionLabel(config: WorkflowNodeConfig): string {
  return config.heygenOrientation === 'portrait' ? '1080p-9:16' : '1080p-16:9';
}
