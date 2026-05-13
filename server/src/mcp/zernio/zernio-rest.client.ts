import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, isAxiosError } from 'axios';

import { getFriendlyZernioPublishError } from './zernio-mcp-publish.util';
import {
  mirrorFetchedBytesToPublicUploadsUrl,
  resolvePublicApiBase as resolvePublicApiBaseFromConfig,
} from '../../upload/file-service-local-mirror.util';

function axiosErrorHint(err: unknown): string {
  if (!isAxiosError(err)) return '';
  const status = err.response?.status;
  if (status === 429) return 'rate limit';
  if (status === 401 || status === 403) return 'unauthorized';
  if (err.code === 'ECONNABORTED') return 'timeout';
  return err.message || '';
}

/** Status + response body for logs / thrown detail (Zernio often returns JSON `error` / `details`). */
function summarizeZernioAxiosError(err: unknown): string | null {
  if (!isAxiosError(err)) return null;
  const status = err.response?.status;
  const data = err.response?.data;
  if (data === undefined && status === undefined) return null;
  let text = '';
  try {
    text =
      typeof data === 'string'
        ? data
        : data !== undefined
          ? JSON.stringify(data)
          : '';
  } catch {
    text = String(data);
  }
  const prefix = typeof status === 'number' ? `${status}` : 'error';
  return text ? `${prefix}: ${text}` : prefix;
}

/** Zernio REST expects embedded media objects, not raw URL strings. */
type ZernioCustomMediaItem = { url: string; type: 'image' | 'video' };

@Injectable()
export class ZernioRestClient {
  private readonly logger = new Logger(ZernioRestClient.name);
  private readonly http: AxiosInstance;

  constructor(private readonly config: ConfigService) {
    this.http = axios.create({
      baseURL: 'https://zernio.com/api/v1',
      headers: {
        Authorization: `Bearer ${this.config.get<string>('ZERNIO_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    });

    this.http.interceptors.response.use(
      (res) => res,
      (err) => {
        const status = err.response?.status;
        const data = err.response?.data;
        this.logger.warn(`Zernio REST error ${status}: ${JSON.stringify(data)}`);
        return Promise.reject(err);
      },
    );
  }

  async publishCreatePost(payload: {
    profileId: string;
    platforms: Array<{
      platform: string;
      accountId: string;
      content: string;
      mediaUrl?: string | null;
      mediaUrls?: string[] | null;
      title?: string | null;
    }>;
    publishNow: boolean;
    scheduledAt: string | null;
  }): Promise<{ postId: string; raw: unknown }> {
    const names = payload.platforms.map((p) => p.platform).join(', ');
    this.logger.log(`[REST] POST /posts → ${names}`);

    if (!payload.profileId?.trim()) {
      throw new Error('Zernio publish failed: missing profileId');
    }
    if (!Array.isArray(payload.platforms) || payload.platforms.length === 0) {
      throw new Error('Zernio publish failed: no platforms provided');
    }
    const invalidPlatform = payload.platforms.find(
      (p) => !p.platform?.trim() || !p.accountId?.trim() || !p.content?.trim(),
    );
    if (invalidPlatform) {
      throw new Error(
        'Zernio publish failed: each platform requires platform, accountId, and content',
      );
    }

    const mediaCache = new Map<string, ZernioCustomMediaItem>();

    const platforms = await Promise.all(
      payload.platforms.map(async (p) => {
        const singleMedia = (p.mediaUrl ?? '').trim();
        const multiMedia =
          p.mediaUrls?.map((u) => u.trim()).filter(Boolean) ?? [];

        const rawUrls = multiMedia.length
          ? multiMedia
          : singleMedia
            ? singleMedia.split(',').map((u) => u.trim()).filter(Boolean)
            : [];

        const customMedia = await this.buildLocalUploadsCustomMedia(
          rawUrls,
          mediaCache,
        );

        const entry: Record<string, unknown> = {
          platform: p.platform,
          accountId: p.accountId,
          customContent: p.content ?? '',
          customMedia,
        };

        const t = p.title?.trim();
        if (t) entry.customTitle = t;

        return entry;
      }),
    );

    const body: Record<string, unknown> = {
      profileId: payload.profileId,
      content: payload.platforms[0]?.content ?? '',
      publishNow: payload.publishNow,
      platforms,
    };

    if (!payload.publishNow && payload.scheduledAt) {
      body.scheduledFor = payload.scheduledAt;
      body.timezone = 'UTC';
    }

    this.logger.log(`[REST] body: ${JSON.stringify(body)}`);

    try {
      const { data } = await this.http.post<Record<string, unknown>>('/posts', body);

      this.logger.log(`[REST] response: ${JSON.stringify(data)}`);

      const postObj =
        data?.post && typeof data.post === 'object'
          ? (data.post as Record<string, unknown>)
          : null;
      let postId: string | null = null;
      if (postObj) {
        if (typeof postObj._id === 'string') postId = postObj._id;
        else if (typeof postObj.id === 'string') postId = postObj.id;
      }
      if (!postId && typeof data._id === 'string') postId = data._id;
      if (!postId && typeof data.id === 'string') postId = data.id;

      if (!postId?.trim()) {
        throw new Error(
          `Zernio REST publish succeeded but no post id returned: ${JSON.stringify(data)}`,
        );
      }

      return { postId: postId.trim(), raw: data };
    } catch (err: unknown) {
      const hint = axiosErrorHint(err);
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Zernio REST publish(${payload.profileId}) threw for ${names}: ${message}`,
      );
      if (message.startsWith('Zernio publish failed:')) {
        throw new Error(message);
      }
      if (message.includes('Zernio REST publish succeeded but no post id')) {
        throw err instanceof Error ? err : new Error(message);
      }
      const friendly = getFriendlyZernioPublishError(
        hint ? new Error(hint) : err,
      );
      throw new Error(friendly || message || 'Zernio publish failed');
    }
  }

  /** Public base for `/uploads` links (ngrok). */
  private resolvePublicApiBase(): string {
    return resolvePublicApiBaseFromConfig(this.config);
  }

  /**
   * Zernio must fetch media over the public internet. Copy bytes into `./uploads` and set
   * `customMedia[].url` to `{APP_URL|PUBLIC_URL}/uploads/...` (served by this API).
   */
  private async buildLocalUploadsCustomMedia(
    rawUrls: string[],
    cache: Map<string, ZernioCustomMediaItem>,
  ): Promise<ZernioCustomMediaItem[]> {
    const out: ZernioCustomMediaItem[] = [];
    for (const raw of rawUrls) {
      const source = this.resolveAbsoluteMediaHref(raw);
      if (!source) continue;

      let item = cache.get(source);
      if (!item) {
        item = await this.mirrorSourceToLocalUploadsUrl(source);
        cache.set(source, item);
      }
      out.push(item);
    }
    return out;
  }

  private async mirrorSourceToLocalUploadsUrl(
    sourceUrl: string,
  ): Promise<ZernioCustomMediaItem> {
    const publicRoot = this.resolvePublicApiBase().replace(/\/+$/, '');
    if (!publicRoot) {
      throw new Error(
        'Zernio publish failed: set APP_URL or PUBLIC_URL so media can be mirrored to /uploads for Zernio to fetch',
      );
    }

    const uploadsPublicPrefix = `${publicRoot}/uploads/`;
    if (sourceUrl.startsWith(uploadsPublicPrefix)) {
      return { url: sourceUrl, type: this.mediaKindForUrl(sourceUrl) };
    }

    const res = await fetch(sourceUrl, {
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
      throw new Error(
        `Zernio publish failed: could not download media (${res.status}): ${sourceUrl}`,
      );
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    if (!buf.length) {
      throw new Error(
        `Zernio publish failed: empty media body when mirroring: ${sourceUrl}`,
      );
    }

    const pathPart = sourceUrl.split(/[/?#]/)[0] ?? '';
    const leaf = pathPart.split('/').pop() || 'zernio-media.png';
    const mimeHint =
      res.headers.get('content-type') || 'application/octet-stream';
    const url = await mirrorFetchedBytesToPublicUploadsUrl(
      buf,
      leaf,
      mimeHint,
      publicRoot,
    );
    return { url, type: this.mediaKindForUrl(url) };
  }

  private mediaKindForUrl(url: string): 'image' | 'video' {
    const pathOnly = url.split(/[?#]/)[0]?.toLowerCase() ?? '';
    if (/\.(mp4|webm|mov|m4v|mkv)(\s|$)/.test(pathOnly)) return 'video';
    return 'image';
  }

  /**
   * Ensures every media URL is absolute (https). Repairs values like `4001/api/file/...`
   * where `http://192.168.x.x:` was stripped but FILE_SERVICE_URL still has the origin.
   */
  private resolveAbsoluteMediaHref(raw: string): string {
    const s = raw.trim();
    if (!s) return '';
    if (/^(https?:|blob:|data:)/i.test(s)) return s;
    if (s.startsWith('//')) return `https:${s}`;

    const fileBase = this.config.get<string>('FILE_SERVICE_URL')?.trim();
    const publicBase =
      this.config.get<string>('APP_URL')?.trim() ||
      this.config.get<string>('PUBLIC_URL')?.trim() ||
      '';

    const portPathMatch = /^(\d{2,5})(\/api\/.+)$/i.exec(s);
    if (portPathMatch?.[2] && fileBase) {
      try {
        const u = new URL(
          fileBase.startsWith('http') ? fileBase : `http://${fileBase}`,
        );
        return `${u.origin}${portPathMatch[2]}`;
      } catch {
        /* fall through */
      }
    }

    if (s.startsWith('/') && publicBase) {
      return `${publicBase.replace(/\/+$/, '')}${s}`;
    }

    if (fileBase) {
      try {
        const base = fileBase.startsWith('http') ? fileBase : `http://${fileBase}`;
        return new URL(s, base).href;
      } catch {
        try {
          const base = fileBase.startsWith('http') ? fileBase : `http://${fileBase}`;
          return new URL(s, new URL(base).origin).href;
        } catch {
          return s;
        }
      }
    }

    return s;
  }

  async updatePost(payload: {
    postId: string;
    content?: string;
    scheduledFor?: string;
    title?: string;
  }): Promise<{ success: boolean }> {
    const postId = payload.postId.trim();
    if (!postId) {
      throw new Error('Zernio update failed: missing postId');
    }

    this.logger.log(`[REST] PUT /posts/${postId}`);

    const body: Record<string, unknown> = {};
    if (payload.content !== undefined) body.content = payload.content;
    if (payload.scheduledFor !== undefined) {
      body.scheduledFor = payload.scheduledFor;
      body.timezone = 'UTC';
    }
    if (payload.title !== undefined) body.title = payload.title;

    this.logger.log(`[REST] PUT body: ${JSON.stringify(body)}`);

    try {
      await this.http.put(`/posts/${postId}`, body);
      return { success: true };
    } catch (err: unknown) {
      const detail = summarizeZernioAxiosError(err);
      if (detail) {
        this.logger.warn(`Zernio REST update(${postId}) ${detail}`);
      }
      const hint = axiosErrorHint(err);
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Zernio REST update(${postId}) threw: ${message}`);
      const friendly = getFriendlyZernioPublishError(
        hint ? new Error(hint) : err,
      );
      const base = friendly || message || 'Zernio update failed';
      throw new Error(detail ? `${base} — ${detail}` : base);
    }
  }

  async getPost(postId: string): Promise<unknown | null> {
    const id = postId.trim();
    if (!id) return null;

    this.logger.log(`[REST] GET /posts/${id}`);

    try {
      const { data } = await this.http.get<Record<string, unknown>>(`/posts/${id}`);
      const post = data?.post ?? data ?? null;
      return post ?? null;
    } catch (err: unknown) {
      if (isAxiosError(err) && err.response?.status === 404) {
        this.logger.warn(`[REST] Post ${id} not found`);
        return null;
      }
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Zernio REST getPost(${id}) threw: ${message}`);
      throw err;
    }
  }

  async getPostAnalytics(postId: string): Promise<unknown | null> {
    const id = postId.trim();
    if (!id) return null;

    this.logger.log(`[REST] GET /analytics/${id}`);

    try {
      const { data } = await this.http.get(`/analytics/${id}`);
      this.logger.log(`[REST] analytics: ${JSON.stringify(data)}`);
      if (data == null) return null;
      return data;
    } catch (err: unknown) {
      if (isAxiosError(err) && err.response?.status === 404) {
        this.logger.warn(`[REST] Analytics for ${id} not found`);
        return null;
      }
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Zernio REST getPostAnalytics(${id}) threw: ${message}`);
      throw err;
    }
  }
}
