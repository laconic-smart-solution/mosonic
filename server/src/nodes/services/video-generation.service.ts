import { Injectable, UnprocessableEntityException } from '@nestjs/common';
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

const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 60;

type NormalizedVideoConfig = {
  provider?: LlmProvider;
  model: string;
  duration: number;
  resolution: string;
  aspectRatio: string;
  secondsForApi: OpenAI.Videos.VideoCreateParams['seconds'];
  sizeForApi: OpenAI.Videos.VideoCreateParams['size'];
};

function normalizeVideoConfig(
  config: NodeExecutionInput['config'],
): NormalizedVideoConfig {
  const c = config ?? {};
  const durationRaw = typeof c.duration === 'number' ? c.duration : 10;
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

  const secondsForApi: OpenAI.Videos.VideoCreateParams['seconds'] =
    durationRaw <= 5 ? '4' : durationRaw <= 10 ? '8' : '12';

  const sizeForApi: OpenAI.Videos.VideoCreateParams['size'] = (() => {
    if (aspectRatio === '9:16') {
      return resolution === '1080p' ? '1024x1792' : '720x1280';
    }
    if (aspectRatio === '16:9') {
      return resolution === '1080p' ? '1792x1024' : '1280x720';
    }
    // Sora API does not expose true 1:1 size. Use portrait fallback and reinforce square feel in prompt.
    return resolution === '1080p' ? '1024x1792' : '720x1280';
  })();

  return {
    provider,
    model,
    duration: durationRaw,
    resolution,
    aspectRatio,
    secondsForApi,
    sizeForApi,
  };
}

function buildVideoPrompt(
  rule: Rule,
  previousOutputs: { text?: string; image?: string },
  userPrompt: string | undefined,
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
    config.aspectRatio === '9:16'
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
    userPrompt ? `Specific instruction (highest priority): ${userPrompt}` : '',
    'No text overlays or watermarks.',
    'No spoken words or voiceover.',
    'Professional marketing video quality.',
  ]
    .filter(Boolean)
    .join('\n');
}

@Injectable()
export class VideoGenerationService {
  constructor(
    private readonly configService: ConfigService,
    private readonly llm: LlmService,
    private readonly events: EventsService,
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

  private async emitProcessing(
    pipelineId: string,
    nodeId: string,
    message: string,
  ): Promise<void> {
    // Progress emits should not fail generation when websocket is temporarily unavailable.
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
      // Some file services validate MIME strictly; fallback can unblock storage.
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

  async generateVideo(
    input: VideoGenerationInput & { pipelineId: string; nodeId: string },
  ): Promise<{ video: string; storage: NodeExecutionResult['video'] }> {
    const { rule, previousOutputs, userPrompt, config, pipelineId, nodeId } =
      input;
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
      userPrompt,
      normalized,
    );

    const client = this.getOpenAiClient(normalized.provider);
    let result = await client.videos.create({
      model: normalized.model,
      prompt,
      size: normalized.sizeForApi,
      seconds: normalized.secondsForApi,
    });

    await this.emitProcessing(
      pipelineId,
      nodeId,
      'Video generation started...',
    );

    let attempts = 0;
    while (result.status !== 'completed' && result.status !== 'failed') {
      if (attempts >= MAX_POLL_ATTEMPTS) {
        throw new Error('Video generation timed out after 5 minutes.');
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      result = await client.videos.retrieve(result.id);
      attempts += 1;
      await this.emitProcessing(
        pipelineId,
        nodeId,
        `Generating video... (${attempts * 5}s)`,
      );
    }

    if (result.status === 'failed') {
      throw new Error(
        result.error?.message || 'Sora video generation failed. Please retry.',
      );
    }

    const videoResponse = await client.videos.downloadContent(result.id);
    if (!videoResponse.ok) {
      throw new Error(
        `Failed to download generated video (${videoResponse.status} ${videoResponse.statusText})`,
      );
    }
    const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
    const fileName = `${nodeId}.mp4`;
    const storage = await this.uploadVideoBuffer({
      videoBuffer,
      fileName,
      folderPath: `videos/${pipelineId}`,
    });

    return { video: storage.fileUrl, storage };
  }

  async execute(input: NodeExecutionInput): Promise<NodeExecutionResult> {
    if (!input.rule) {
      throw new UnprocessableEntityException(
        'Video generation requires `rule` on NodeExecutionInput',
      );
    }
    const { video, storage } = await this.generateVideo({
      rule: input.rule,
      contentPrompt: input.contentPrompt ?? '',
      previousOutputs: input.previousOutputs ?? {},
      userPrompt: input.userPrompt,
      config: input.config ?? {},
      pipelineId: input.pipelineRef,
      nodeId: input.nodeId,
    });
    return { output: video, video: storage };
  }
}
