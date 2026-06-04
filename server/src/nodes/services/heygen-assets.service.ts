import {
  Injectable,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const HEYGEN_BASE = 'https://api.heygen.com';

export type HeygenVoice = {
  voiceId: string;
  name: string;
  language: string;
  gender?: string;
  previewAudioUrl?: string;
  type?: string;
};

type HeygenVoiceRaw = {
  voice_id?: string;
  name?: string;
  language?: string;
  gender?: string;
  preview_audio_url?: string;
  preview_audio?: string;
  type?: string;
};

function mapHeygenVoiceRaw(raw: HeygenVoiceRaw): HeygenVoice | null {
  const voiceId = raw.voice_id?.trim() ?? '';
  if (!voiceId) return null;
  const genderRaw = raw.gender?.trim().toLowerCase();
  const gender =
    genderRaw === 'male' || genderRaw === 'female' ? genderRaw : undefined;
  const preview =
    raw.preview_audio_url?.trim() || raw.preview_audio?.trim() || undefined;
  return {
    voiceId,
    name: raw.name?.trim() || 'Voice',
    language: raw.language?.trim() || '',
    gender,
    previewAudioUrl: preview,
    type: raw.type?.trim() || undefined,
  };
}

export type HeygenAvatarLook = {
  lookId: string;
  name: string;
  avatarType: string;
  previewImageUrl?: string;
  defaultVoiceId?: string;
  status?: string;
  deletable: boolean;
};

type HeygenAvatarLookRaw = {
  id?: string;
  name?: string;
  avatar_type?: string;
  preview_image_url?: string;
  default_voice_id?: string;
  status?: string;
};

function mapAvatarLook(raw: HeygenAvatarLookRaw): HeygenAvatarLook | null {
  const lookId = raw.id?.trim();
  if (!lookId) return null;
  const avatarType = raw.avatar_type?.trim() ?? 'unknown';
  return {
    lookId,
    name: raw.name?.trim() || 'Avatar',
    avatarType,
    previewImageUrl: raw.preview_image_url?.trim() || undefined,
    defaultVoiceId: raw.default_voice_id?.trim() || undefined,
    status: raw.status?.trim() || undefined,
    deletable: avatarType !== 'studio_avatar',
  };
}

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

function extractHeygenErrorMessage(body: unknown, fallback: string): string {
  if (typeof body === 'object' && body !== null) {
    if (
      'message' in body &&
      typeof (body as { message: unknown }).message === 'string'
    ) {
      return (body as { message: string }).message;
    }
    const nested = (body as { error?: { message?: unknown } }).error;
    if (nested && typeof nested.message === 'string') {
      return nested.message;
    }
  }
  return fallback;
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
      const msg = extractHeygenErrorMessage(body, text || resp.statusText);
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
  }): Promise<{ avatarId: string; previewImageUrl?: string }> {
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
      data?: {
        avatar_item?: { id?: string; preview_image_url?: string };
        avatar_id?: string;
      };
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
    const previewImageUrl =
      data.data?.avatar_item?.preview_image_url?.trim() || undefined;
    return { avatarId, previewImageUrl };
  }

  async listAvatarLooks(): Promise<HeygenAvatarLook[]> {
    const results: HeygenAvatarLook[] = [];
    let token: string | undefined;

    do {
      const query = new URLSearchParams({
        ownership: 'private',
        limit: '50',
      });
      if (token) {
        query.set('token', token);
      }

      const resp = await fetch(
        `${HEYGEN_BASE}/v3/avatars/looks?${query.toString()}`,
        { headers: { 'x-api-key': this.getApiKey() } },
      );

      const data = await this.parseHeygenJson<{
        data?: HeygenAvatarLookRaw[];
        has_more?: boolean;
        next_token?: string;
      }>(resp, 'HeyGen list avatar looks');

      for (const raw of data.data ?? []) {
        const mapped = mapAvatarLook(raw);
        if (mapped) results.push(mapped);
      }

      token =
        data.has_more && data.next_token?.trim()
          ? data.next_token.trim()
          : undefined;
    } while (token);

    return results;
  }

  async deleteAvatarLook(lookId: string): Promise<{ lookId: string }> {
    const trimmed = lookId?.trim();
    if (!trimmed) {
      throw new UnprocessableEntityException('Avatar look id is required');
    }

    const resp = await fetch(`${HEYGEN_BASE}/v3/avatars/looks/${trimmed}`, {
      method: 'DELETE',
      headers: { 'x-api-key': this.getApiKey() },
    });

    const data = await this.parseHeygenJson<{
      data?: { id?: string };
    }>(resp, 'HeyGen delete avatar look');

    return { lookId: data.data?.id?.trim() ?? trimmed };
  }

  /** One HeyGen page only — use `token` for cursor pagination. */
  async listVoicesPage(params?: {
    language?: string;
    gender?: string;
    limit?: number;
    token?: string;
  }): Promise<{
    voices: HeygenVoice[];
    hasMore: boolean;
    nextToken?: string;
  }> {
    const limit = Math.min(
      100,
      Math.max(1, params?.limit ?? 20),
    );
    const query = new URLSearchParams({
      limit: String(limit),
      type: 'public',
    });
    if (params?.language?.trim()) {
      query.set('language', params.language.trim());
    }
    if (params?.gender?.trim()) {
      query.set('gender', params.gender.trim());
    }
    if (params?.token?.trim()) {
      query.set('token', params.token.trim());
    }

    const resp = await fetch(`${HEYGEN_BASE}/v3/voices?${query.toString()}`, {
      headers: { 'x-api-key': this.getApiKey() },
    });
    const data = await this.parseHeygenJson<{
      data?: HeygenVoiceRaw[];
      has_more?: boolean;
      next_token?: string;
    }>(resp, 'HeyGen list voices');

    const voices: HeygenVoice[] = [];
    for (const v of data.data ?? []) {
      const mapped = mapHeygenVoiceRaw(v);
      if (mapped) voices.push(mapped);
    }

    const nextToken = data.next_token?.trim() || undefined;
    return {
      voices,
      hasMore: Boolean(data.has_more && nextToken),
      nextToken,
    };
  }

  async getVoice(voiceId: string): Promise<HeygenVoice> {
    const trimmed = voiceId?.trim();
    if (!trimmed) {
      throw new UnprocessableEntityException('Voice id is required');
    }

    const resp = await fetch(`${HEYGEN_BASE}/v3/voices/${trimmed}`, {
      headers: { 'x-api-key': this.getApiKey() },
    });

    const data = await this.parseHeygenJson<{ data?: HeygenVoiceRaw }>(
      resp,
      'HeyGen get voice',
    );

    const mapped = mapHeygenVoiceRaw(data.data ?? {});
    if (!mapped) {
      throw new UnprocessableEntityException('HeyGen voice not found');
    }
    return mapped;
  }

  async fetchVoicePreviewAudio(voiceId: string): Promise<{
    buffer: Buffer;
    contentType: string;
  }> {
    const voice = await this.getVoice(voiceId);
    const url = voice.previewAudioUrl?.trim();
    if (!url) {
      throw new UnprocessableEntityException(
        'This voice does not have a preview audio clip',
      );
    }

    const resp = await fetch(url);
    if (!resp.ok) {
      throw new UnprocessableEntityException(
        `Voice preview download failed (${resp.status})`,
      );
    }

    const buffer = Buffer.from(await resp.arrayBuffer());
    const contentType =
      resp.headers.get('content-type')?.trim() || 'audio/wav';
    return { buffer, contentType };
  }

  async submitPresenterVideo(
    params: HeygenSubmitPresenterParams,
  ): Promise<{ videoId: string }> {
    const portrait = params.orientation === 'portrait';
    const script = params.script.trim();
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
