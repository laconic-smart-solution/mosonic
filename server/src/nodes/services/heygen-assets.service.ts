import {
  Injectable,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { trimScriptToTargetDuration } from './presenter-script.util';

const HEYGEN_BASE = 'https://api.heygen.com';

export type HeygenVoice = {
  voiceId: string;
  name: string;
  language: string;
  preview?: string;
};

export type HeygenVideoStatus = 'processing' | 'completed' | 'failed';

export type HeygenSubmitPresenterParams = {
  avatarId: string;
  script: string;
  voiceId: string;
  /** Target length in seconds; script is trimmed to fit (HeyGen has no duration API). */
  durationSeconds?: number;
  orientation?: 'landscape' | 'portrait';
  expressiveness?: 'low' | 'medium' | 'high';
  motionPrompt?: string;
  removeBackground?: boolean;
  backgroundAssetId?: string;
  callbackUrl: string;
  callbackId: string;
};

export function heygenCallbackId(pipelineId: string, nodeId: string): string {
  return `${pipelineId}__${nodeId}`;
}

export function parseHeygenCallbackId(
  callbackId: string,
): { pipelineId: string; nodeId: string } | null {
  const trimmed = callbackId?.trim();
  if (!trimmed) return null;
  const idx = trimmed.indexOf('__');
  if (idx <= 0 || idx >= trimmed.length - 2) return null;
  return {
    pipelineId: trimmed.slice(0, idx),
    nodeId: trimmed.slice(idx + 2),
  };
}

@Injectable()
export class HeygenAssetsService {
  constructor(private readonly config: ConfigService) {}

  private getApiKey(): string {
    const key = this.config.get<string>('HEYGEN_API_KEY')?.trim();
    if (!key) {
      throw new ServiceUnavailableException(
        'HEYGEN_API_KEY is not configured. Presenter video requires HeyGen.',
      );
    }
    return key;
  }

  private jsonHeaders(): Record<string, string> {
    return {
      'x-api-key': this.getApiKey(),
      'Content-Type': 'application/json',
    };
  }

  private async parseHeygenJson<T>(resp: Response, context: string): Promise<T> {
    const text = await resp.text().catch(() => '');
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      throw new UnprocessableEntityException(
        `${context}: invalid JSON response (${resp.status})`,
      );
    }
    if (!resp.ok) {
      const msg =
        typeof body === 'object' &&
        body !== null &&
        'message' in body &&
        typeof (body as { message: unknown }).message === 'string'
          ? (body as { message: string }).message
          : text || resp.statusText;
      throw new UnprocessableEntityException(
        `${context} failed (${resp.status}): ${msg}`,
      );
    }
    return body as T;
  }

  async uploadAsset(
    fileBuffer: Buffer,
    mimeType: string,
    fileName = 'upload.jpg',
  ): Promise<{ assetId: string; url: string }> {
    const formData = new FormData();
    const blob = new Blob([Uint8Array.from(fileBuffer)], { type: mimeType });
    formData.append('file', blob, fileName);

    const resp = await fetch(`${HEYGEN_BASE}/v3/assets`, {
      method: 'POST',
      headers: { 'x-api-key': this.getApiKey() },
      body: formData,
    });

    const data = await this.parseHeygenJson<{
      data?: { asset_id?: string; url?: string };
    }>(resp, 'HeyGen asset upload');

    const assetId = data.data?.asset_id?.trim();
    const url = data.data?.url?.trim() ?? '';
    if (!assetId) {
      throw new UnprocessableEntityException(
        'HeyGen asset upload did not return asset_id',
      );
    }
    return { assetId, url };
  }

  async createPhotoAvatar(params: {
    name: string;
    assetId: string;
  }): Promise<{ avatarId: string }> {
    const resp = await fetch(`${HEYGEN_BASE}/v3/avatars`, {
      method: 'POST',
      headers: this.jsonHeaders(),
      body: JSON.stringify({
        type: 'photo',
        name: params.name,
        file: { type: 'asset_id', asset_id: params.assetId },
      }),
    });

    const data = await this.parseHeygenJson<{
      data?: { avatar_item?: { id?: string }; avatar_id?: string };
    }>(resp, 'HeyGen photo avatar');

    const avatarId =
      data.data?.avatar_item?.id?.trim() ??
      data.data?.avatar_id?.trim() ??
      '';
    if (!avatarId) {
      throw new UnprocessableEntityException(
        'HeyGen photo avatar did not return avatar id',
      );
    }
    return { avatarId };
  }

  async listVoices(params?: {
    language?: string;
    gender?: string;
  }): Promise<HeygenVoice[]> {
    const query = new URLSearchParams();
    if (params?.language?.trim()) {
      query.set('language', params.language.trim());
    }
    if (params?.gender?.trim()) {
      query.set('gender', params.gender.trim());
    }
    const qs = query.toString();
    const url = `${HEYGEN_BASE}/v3/voices${qs ? `?${qs}` : ''}`;

    const resp = await fetch(url, { headers: { 'x-api-key': this.getApiKey() } });
    const data = await this.parseHeygenJson<{
      data?: Array<{
        voice_id?: string;
        name?: string;
        language?: string;
        preview_audio?: string;
      }>;
    }>(resp, 'HeyGen list voices');

    return (data.data ?? []).map((v) => ({
      voiceId: v.voice_id ?? '',
      name: v.name ?? 'Voice',
      language: v.language ?? '',
      preview: v.preview_audio,
    })).filter((v) => v.voiceId);
  }

  async submitPresenterVideo(
    params: HeygenSubmitPresenterParams,
  ): Promise<{ videoId: string }> {
    const portrait = params.orientation === 'portrait';
    const durationSeconds = params.durationSeconds ?? 8;
    const script = trimScriptToTargetDuration(params.script, durationSeconds);
    // POST /v3/videos is a discriminated union — `type: "avatar"` is required.
    const body: Record<string, unknown> = {
      type: 'avatar',
      avatar_id: params.avatarId,
      script,
      voice_id: params.voiceId,
      aspect_ratio: portrait ? '9:16' : '16:9',
      resolution: '1080p',
      remove_background: params.removeBackground ?? true,
      expressiveness: params.expressiveness ?? 'medium',
      callback_url: params.callbackUrl,
      callback_id: params.callbackId,
    };

    if (params.motionPrompt?.trim()) {
      body.motion_prompt = params.motionPrompt.trim();
    }

    if (params.backgroundAssetId?.trim()) {
      // BackgroundSetting: type is "image" | "color", not "asset_id".
      body.background = {
        type: 'image',
        asset_id: params.backgroundAssetId.trim(),
      };
    }

    const resp = await fetch(`${HEYGEN_BASE}/v3/videos`, {
      method: 'POST',
      headers: this.jsonHeaders(),
      body: JSON.stringify(body),
    });

    const data = await this.parseHeygenJson<{
      data?: { video_id?: string };
      video_id?: string;
    }>(resp, 'HeyGen video submit');

    const videoId =
      data.data?.video_id?.trim() ?? data.video_id?.trim() ?? '';
    if (!videoId) {
      throw new UnprocessableEntityException(
        'HeyGen did not return video_id',
      );
    }
    return { videoId };
  }

  async getVideoStatus(videoId: string): Promise<{
    status: HeygenVideoStatus;
    videoUrl?: string;
    thumbnailUrl?: string;
    duration?: number;
    error?: string;
  }> {
    const resp = await fetch(`${HEYGEN_BASE}/v3/videos/${videoId}`, {
      headers: { 'x-api-key': this.getApiKey() },
    });

    const data = await this.parseHeygenJson<{
      data?: {
        status?: string;
        video_url?: string;
        thumbnail_url?: string;
        duration?: number;
        error?: string;
        failure_message?: string;
      };
      status?: string;
    }>(resp, 'HeyGen video status');

    const raw =
      data.data?.status?.toLowerCase() ?? data.status?.toLowerCase() ?? '';
    let status: HeygenVideoStatus = 'processing';
    if (raw === 'completed' || raw === 'complete' || raw === 'success') {
      status = 'completed';
    } else if (raw === 'failed' || raw === 'error') {
      status = 'failed';
    }

    return {
      status,
      videoUrl: data.data?.video_url,
      thumbnailUrl: data.data?.thumbnail_url,
      duration: data.data?.duration,
      error:
        data.data?.failure_message ??
        data.data?.error ??
        (status === 'failed' ? 'HeyGen video generation failed' : undefined),
    };
  }

  resolveCallbackUrl(): string {
    const base =
      this.config.get<string>('APP_URL')?.trim() ||
      this.config.get<string>('PUBLIC_URL')?.trim() ||
      '';
    if (!base) {
      throw new ServiceUnavailableException(
        'APP_URL or PUBLIC_URL must be set for HeyGen webhook callbacks',
      );
    }
    return `${base.replace(/\/+$/, '')}/webhooks/heygen`;
  }
}
