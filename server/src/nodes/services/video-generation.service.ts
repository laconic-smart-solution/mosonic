import {
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import { buildFileStorageFolderPath } from '../../common/utils/file-storage-path.util';
import { fetchUrlToBuffer } from '../../upload/fetch-url-to-buffer.util';
import { uploadBufferToFileService } from '../../upload/file-service-upload.util';
import type { WorkflowNodeConfig } from '../schemas/workflow-node.schema';
import {
  HeygenAssetsService,
  heygenCallbackId,
  type HeygenVideoStatus,
} from './heygen-assets.service';
import {
  computePresenterVoiceSpeed,
  resolveHeygenWordsPerSecond,
} from './presenter-script.util';
import {
  ScriptDurationService,
  type ScriptFitMethod,
} from './script-duration.service';
import { videoModeForNode, type VideoGenerationMode } from '../video-node-type.util';

/** Inline execution poll (deprecated path when queue is off). */
const INLINE_POLL_INTERVAL_MS = 5000;
const INLINE_VIDEO_TIMEOUT_MS = 30 * 60 * 1000;

export type VideoJobStatus = 'processing' | 'completed' | 'failed';

export type VideoJobProvider = 'sora' | 'heygen';

export type PresenterScriptMeta = {
  wordCount: number;
  method: ScriptFitMethod;
  targetSeconds: number;
  voiceSpeed: number;
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

/** HeyGen cinematic durations; prompt constraints below apply to cinematic prompts — no on-screen text, logos, or contact details. */
export const CINEMATIC_VIDEO_DURATIONS = [5, 10, 15] as const;
export type CinematicVideoDuration = (typeof CINEMATIC_VIDEO_DURATIONS)[number];

export function normalizeCinematicDurationSeconds(
  raw: unknown,
): CinematicVideoDuration {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : 10;
  let best: CinematicVideoDuration = CINEMATIC_VIDEO_DURATIONS[1];
  let bestDiff = Math.abs(n - best);
  for (const s of CINEMATIC_VIDEO_DURATIONS) {
    const d = Math.abs(n - s);
    if (d < bestDiff) {
      best = s;
      bestDiff = d;
    }
  }
  return best;
}

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
        : 10;
  const duration = normalizeCinematicDurationSeconds(
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
    'heygen_video_1',
    'seedance_2',
    'heygen-video-1',
  ]);
  const model = allowedModels.has(requestedModel)
    ? requestedModel
    : 'heygen_video_1';
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
  };
}

export function buildVideoPrompt(
  rule: Rule,
  previousOutputs: { text?: string; image?: string },
  config: NormalizedVideoConfig,
  sourcePackNotes?: string,
): string {
  return [
    'Create a short marketing video for the following content:',
    `"${previousOutputs.text ?? ''}"`,
    '',
    sourcePackNotes?.trim()
      ? `Source attachments for this run:\n${sourcePackNotes.trim()}`
      : '',
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
    config.negativePrompt ? `Additionally avoid: ${config.negativePrompt}` : '',
    'Professional marketing video quality.',
  ]
    .filter(Boolean)
    .join('\n');
}

export type { VideoGenerationMode };

/**
 * Presenter (HeyGen talking avatar) vs cinematic (HeyGen cinematic_avatar / heygen_video).
 * legacy `video_generation` (or no type) reads `config.mode`.
 */
export function getVideoGenerationMode(
  config: WorkflowNodeConfig | undefined,
  nodeType?: string,
): VideoGenerationMode {
  return videoModeForNode(nodeType, config);
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

export function mapHeygenVideoStatus(
  status: HeygenVideoStatus,
): VideoJobStatus {
  if (status === 'completed') return 'completed';
  if (status === 'failed') return 'failed';
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

  private assertPresenterConfig(config: WorkflowNodeConfig): {
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
    const config = input.config ?? {};
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

    const wps = resolveHeygenWordsPerSecond(
      this.configService.get<string>('HEYGEN_WORDS_PER_SECOND'),
    );
    const voiceSpeed = computePresenterVoiceSpeed(
      wordCount,
      presenter.durationSeconds,
      wps,
    );
    const approxSeconds = Math.round(wordCount / wps);
    this.logger.log(
      `[VideoGen] presenter script: target=${presenter.durationSeconds}s words=${wordCount} ~${approxSeconds}s speed=${voiceSpeed.toFixed(2)} method=${method}`,
    );
    await this.emitProcessing(
      input.pipelineId,
      input.nodeId,
      `Target ${presenter.durationSeconds}s · script ${wordCount}w · voice ${voiceSpeed.toFixed(2)}x (${method})`,
    );

    const { videoId } = await this.heygen.submitPresenterVideo({
      avatarId: presenter.avatarId,
      script,
      voiceId: presenter.voiceId,
      durationSeconds: presenter.durationSeconds,
      voiceSpeed,
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
      presenterScriptMeta: {
        wordCount,
        method,
        targetSeconds: presenter.durationSeconds,
        voiceSpeed,
      },
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
      folderPath: buildFileStorageFolderPath('videos', input.pipelineId),
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

    const config = input.config ?? {};
    const presenterDuration = normalizePresenterDurationSeconds(
      config.duration,
    );
    this.logger.log(
      `[VideoGen] presenter complete: target=${presenterDuration}s heygen=${status.duration ?? 'unknown'}s`,
    );

    return {
      video: storage.fileUrl,
      storage,
      videoCost: {
        model: 'heygen-presenter',
        videoSeconds: status.duration ?? presenterDuration,
        videoResolution: presenterResolutionLabel(config),
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
        throw new Error(
          'Presenter video generation timed out after 30 minutes.',
        );
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

  /** `video_presenter` node: always HeyGen, regardless of stored config.mode. */
  executePresenter(input: NodeExecutionInput): Promise<NodeExecutionResult> {
    return this.execute({
      ...input,
      config: { ...(input.config ?? {}), mode: 'presenter' },
    });
  }

  /** `video_cinematic` node: HeyGen (cinematic_avatar | heygen_video), regardless of stored config.mode. */
  executeCinematic(input: NodeExecutionInput): Promise<NodeExecutionResult> {
    return this.execute({
      ...input,
      config: { ...(input.config ?? {}), mode: 'cinematic' },
    });
  }

  /** Legacy `video_generation`: mode from config. */
  async execute(input: NodeExecutionInput): Promise<NodeExecutionResult> {
    if (!input.rule) {
      throw new UnprocessableEntityException(
        'Video generation requires `rule` on NodeExecutionInput',
      );
    }
    const config = input.config ?? {};
    const execInput = {
      rule: input.rule,
      contentPrompt: input.contentPrompt ?? '',
      previousOutputs: input.previousOutputs ?? {},
      config,
      sourcePack: input.sourcePack,
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

    const { video, storage, costModel, duration, resolution } =
      await this.generateCinematicVideo(execInput);
    return {
      output: video,
      video: storage,
      videoCost: {
        model: costModel,
        videoSeconds: duration,
        videoResolution: resolution,
      },
    };
  }

  private resolveCinematicPrompt(input: VideoGenerationInput): string {
    const fromMessage =
      input.contentPrompt?.trim() ||
      input.previousOutputs?.adaptedCaption?.trim() ||
      input.previousOutputs?.text?.trim() ||
      '';
    if (!fromMessage) {
      throw new UnprocessableEntityException(
        'Cinematic video requires a scene prompt (node userPrompt or upstream text)',
      );
    }
    return fromMessage;
  }

  private resolveCinematicAvatarIds(config: WorkflowNodeConfig): string[] {
    const ids: string[] = [];
    const arr = (config as { heygenAvatarIds?: unknown }).heygenAvatarIds;
    if (Array.isArray(arr)) {
      for (const id of arr) {
        if (typeof id === 'string' && id.trim()) ids.push(id.trim());
      }
    }
    const single = config.heygenAvatarId?.trim();
    if (single && !ids.includes(single)) ids.unshift(single);
    return ids.slice(0, 3);
  }

  async submitCinematicVideoJob(
    input: VideoGenerationInput & { pipelineId: string; nodeId: string },
  ): Promise<VideoSubmitResult> {
    const config = input.config ?? {};
    const prompt = this.resolveCinematicPrompt(input);
    const cinematicMode =
      (config as { cinematicMode?: string }).cinematicMode === 'heygen_video'
        ? 'heygen_video'
        : 'cinematic_avatar';
    const duration = normalizeCinematicDurationSeconds(config.duration);
    const aspectRatio =
      typeof config.aspectRatio === 'string' && config.aspectRatio.trim()
        ? config.aspectRatio.trim()
        : '16:9';
    const resolution =
      typeof config.resolution === 'string' && config.resolution.trim()
        ? config.resolution.trim()
        : cinematicMode === 'heygen_video'
          ? '768p'
          : '720p';
    // heygen-video-1 only accepts 480p/768p/1080p/2k; node defaults carry 720p.
    const HEYGEN_VIDEO_RES = ['480p', '768p', '1080p', '2k'];
    const submitResolution =
      cinematicMode === 'heygen_video' && !HEYGEN_VIDEO_RES.includes(resolution)
        ? '768p'
        : resolution;

    await this.emitProcessing(
      input.pipelineId,
      input.nodeId,
      `Cinematic (${cinematicMode}) · ${duration}s · ${aspectRatio}`,
    );

    let videoId: string;

    if (cinematicMode === 'cinematic_avatar') {
      const avatarIds = this.resolveCinematicAvatarIds(config);
      if (!avatarIds.length) {
        throw new UnprocessableEntityException(
          'Cinematic avatar mode requires a HeyGen look. Upload or pick one in node settings.',
        );
      }
      const model =
        (config as { heygenCinematicModel?: string }).heygenCinematicModel ===
        'seedance_2'
          ? 'seedance_2'
          : 'heygen_video_1';
      const refsRaw = (config as { heygenReferenceAssetIds?: unknown })
        .heygenReferenceAssetIds;
      const references =
        Array.isArray(refsRaw) && refsRaw.length
          ? refsRaw
              .filter((id): id is string => typeof id === 'string' && !!id.trim())
              .map((asset_id) => ({
                type: 'asset_id' as const,
                asset_id: asset_id.trim(),
              }))
          : undefined;
      ({ videoId } = await this.heygen.submitCinematicAvatarVideo({
        prompt,
        avatarIds,
        model,
        durationSeconds: duration,
        aspectRatio,
        resolution,
        enhancePrompt: (config as { enhancePrompt?: boolean }).enhancePrompt,
        references,
      }));
    } else {
      const heygenVideoMode = ((config as { heygenVideoMode?: string })
        .heygenVideoMode ?? 'text_to_video') as
        | 'text_to_video'
        | 'image_to_video'
        | 'reference_to_video';
      const refIds = (config as { heygenReferenceAssetIds?: unknown })
        .heygenReferenceAssetIds;
      const referenceAssetIds = Array.isArray(refIds)
        ? refIds.filter((id): id is string => typeof id === 'string' && !!id.trim())
        : undefined;
      const imageUrl = (
        config as { heygenReferenceImageUrl?: string }
      ).heygenReferenceImageUrl?.trim();
      ({ videoId } = await this.heygen.submitHeygenVideoModel({
        prompt,
        mode: heygenVideoMode,
        durationSeconds: duration,
        aspectRatio,
        resolution: submitResolution,
        promptEnhancement: (
          config as {
            promptEnhancement?:
              | 'turbo'
              | 'quality'
              | 'ultraquality'
              | 'disabled';
          }
        ).promptEnhancement,
        seed: (config as { seed?: number }).seed,
        imageUrl,
        referenceAssetIds,
        callbackUrl: this.heygen.resolveCallbackUrl(),
        callbackId: heygenCallbackId(input.pipelineId, input.nodeId),
      }));
    }

    return {
      externalJobId: videoId,
      estimatedSeconds: duration,
      normalized: normalizeVideoConfig(config),
      videoProvider: 'heygen',
    };
  }

  async generateCinematicVideo(
    input: VideoGenerationInput & { pipelineId: string; nodeId: string },
  ): Promise<{
    video: string;
    storage: VideoCompleteResult['storage'];
    costModel: string;
    duration: number;
    resolution: string;
  }> {
    const config = input.config ?? {};
    const submitted = await this.submitCinematicVideoJob(input);
    const cinematicMode =
      (config as { cinematicMode?: string }).cinematicMode === 'heygen_video'
        ? 'heygen_video'
        : 'cinematic_avatar';
    const costModel =
      cinematicMode === 'heygen_video'
        ? `heygen-video:${(config as { heygenVideoMode?: string }).heygenVideoMode ?? 'text_to_video'}`
        : `heygen-cinematic-avatar:${(config as { heygenCinematicModel?: string }).heygenCinematicModel ?? 'heygen_video_1'}`;

    await this.emitProcessing(
      input.pipelineId,
      input.nodeId,
      'Cinematic video generation started...',
    );

    const deadline = Date.now() + 30 * 60 * 1000;
    let attempts = 0;
    const poll = async (): Promise<VideoCheckResult> => {
      if (cinematicMode === 'heygen_video') {
        const result = await this.heygen.getHeygenVideoModelStatus(
          submitted.externalJobId,
        );
        return {
          status: mapHeygenVideoStatus(result.status),
          error: result.error,
        };
      }
      return this.checkHeyGenVideoJob(submitted.externalJobId);
    };

    let check = await poll();
    while (check.status === 'processing') {
      if (Date.now() > deadline) {
        throw new Error('Cinematic video generation timed out after 30 minutes.');
      }
      await new Promise((r) => setTimeout(r, INLINE_POLL_INTERVAL_MS));
      attempts += 1;
      await this.emitProcessing(
        input.pipelineId,
        input.nodeId,
        `Generating cinematic video... (~${attempts * (INLINE_POLL_INTERVAL_MS / 1000)}s, est. ${submitted.estimatedSeconds}s)`,
      );
      check = await poll();
    }
    if (check.status === 'failed') {
      throw new Error(check.error ?? 'HeyGen cinematic video failed. Please retry.');
    }

    const completed = await this.completeHeyGenVideoJob(
      submitted.externalJobId,
      input,
    );
    return {
      video: completed.video,
      storage: completed.storage,
      costModel,
      duration: submitted.estimatedSeconds,
      resolution:
        typeof config.resolution === 'string' && config.resolution.trim()
          ? config.resolution.trim()
          : submitted.normalized.resolution,
    };
  }
}
function presenterResolutionLabel(config: WorkflowNodeConfig): string {
  return config.heygenOrientation === 'portrait' ? '1080p-9:16' : '1080p-16:9';
}
