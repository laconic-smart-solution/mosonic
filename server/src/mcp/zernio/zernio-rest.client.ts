import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, isAxiosError } from 'axios';

import { getFriendlyZernioPublishError } from './zernio-mcp-publish.util';
import { assertTikTokPhotoCaptionForPublish } from './tiktok-publish.util';
import {
  assertPdfNotUsedForPresign,
  isLikelyZernioAccessibleMediaUrl,
  leafFileNameFromUrl,
  normalizePresignResponse,
  resolvePresignMime,
  sniffMimeFromBytes,
  zernioMediaItemTypeFromMime,
  type ZernioPresignResult,
} from './zernio-rest-media.util';
import { resolveAbsoluteMediaUrlFromConfig } from '../../upload/resolve-absolute-media-url.util';

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

/** Zernio REST expects embedded media objects `{ url, type }` in `mediaItems` / `customMedia`. */
type ZernioCustomMediaItem = { url: string; type: 'image' | 'video' };

function toZernioDateOnly(input: string | undefined): string | undefined {
  const s = input?.trim();
  if (!s) return undefined;
  // Zernio analytics expects YYYY-MM-DD (not full ISO datetime).
  // Accept already-correct values.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString().slice(0, 10);
}

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
        this.logger.warn(
          `Zernio REST error ${status}: ${JSON.stringify(data)}`,
        );
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
        assertTikTokPhotoCaptionForPublish(
          p.platform,
          p.content,
          p.mediaUrl,
          p.mediaUrls,
        );

        const singleMedia = (p.mediaUrl ?? '').trim();
        const multiMedia =
          p.mediaUrls?.map((u) => u.trim()).filter(Boolean) ?? [];

        const rawUrls = multiMedia.length
          ? multiMedia
          : singleMedia
            ? singleMedia
                .split(',')
                .map((u) => u.trim())
                .filter(Boolean)
            : [];

        const customMedia = await this.buildZernioMediaItemsFromUrls(
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

    const firstPlat = platforms[0] as Record<string, unknown> | undefined;
    const firstMedia = firstPlat?.customMedia;
    if (Array.isArray(firstMedia) && firstMedia.length > 0) {
      body.mediaItems = firstMedia as ZernioCustomMediaItem[];
    }

    this.logger.log(`[REST] body: ${JSON.stringify(body)}`);

    try {
      const { data } = await this.http.post<Record<string, unknown>>(
        '/posts',
        body,
      );

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

  /**
   * Presign then upload bytes to Zernio storage (official flow).
   * Exported for tests that mock `http` only.
   */
  async presignMedia(input: {
    fileName: string;
    fileType: string;
  }): Promise<ZernioPresignResult> {
    this.logger.log(
      `[REST] POST /media/presign → ${input.fileName} (${input.fileType})`,
    );
    try {
      // Live API expects `filename` + `contentType` (not fileName/fileType).
      const { data } = await this.http.post<Record<string, unknown>>(
        '/media/presign',
        {
          filename: input.fileName,
          contentType: input.fileType,
        },
      );
      const norm = normalizePresignResponse(data);
      if (!norm) {
        throw new Error(
          `Zernio presign returned unexpected shape: ${JSON.stringify(data)}`,
        );
      }
      return norm;
    } catch (err: unknown) {
      const detail = summarizeZernioAxiosError(err);
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Zernio REST presign threw: ${message}${detail ? ` — ${detail}` : ''}`,
      );
      throw new Error(
        detail
          ? `Zernio media presign failed — ${detail}`
          : message || 'Zernio media presign failed',
      );
    }
  }

  /**
   * PUT to GCS (or other) presigned URL — no Zernio Bearer header.
   */
  async putBytesToPresignedUrl(
    uploadUrl: string,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<void> {
    try {
      await axios.put(uploadUrl, Buffer.from(bytes), {
        headers: { 'Content-Type': contentType },
        timeout: 120_000,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        validateStatus: (s) => s >= 200 && s < 300,
      });
    } catch (err: unknown) {
      const detail = summarizeZernioAxiosError(err);
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Zernio media upload to presigned URL failed: ${message}${detail ? ` — ${detail}` : ''}`,
      );
      throw new Error(
        detail
          ? `Zernio media upload failed — ${detail}`
          : message || 'Zernio media upload failed',
      );
    }
  }

  /**
   * Download from source URL, upload via Zernio presign, return `publicUrl` media item.
   */
  private async uploadSourceUrlToZernioMediaItem(
    sourceUrl: string,
  ): Promise<ZernioCustomMediaItem> {
    if (isLikelyZernioAccessibleMediaUrl(sourceUrl)) {
      return {
        url: sourceUrl,
        type: this.mediaKindForUrl(sourceUrl),
      };
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
        `Zernio publish failed: empty media body when uploading: ${sourceUrl}`,
      );
    }

    let fileName = leafFileNameFromUrl(sourceUrl);
    const sniffed = sniffMimeFromBytes(buf);
    const mime = sniffed?.mime
      ? sniffed.mime
      : resolvePresignMime(res.headers.get('content-type'), fileName);
    if (sniffed?.ext && !/\.[a-z0-9]+$/i.test(fileName)) {
      fileName = `${fileName}.${sniffed.ext}`;
    }
    assertPdfNotUsedForPresign(mime);

    const { uploadUrl, publicUrl } = await this.presignMedia({
      fileName,
      fileType: mime,
    });
    await this.putBytesToPresignedUrl(uploadUrl, buf, mime);

    return {
      url: publicUrl,
      type: zernioMediaItemTypeFromMime(mime),
    };
  }

  private async buildZernioMediaItemsFromUrls(
    rawUrls: string[],
    cache: Map<string, ZernioCustomMediaItem>,
  ): Promise<ZernioCustomMediaItem[]> {
    const out: ZernioCustomMediaItem[] = [];
    for (const raw of rawUrls) {
      const source = this.resolveAbsoluteMediaHref(raw);
      if (!source) continue;

      let item = cache.get(source);
      if (!item) {
        item = await this.uploadSourceUrlToZernioMediaItem(source);
        cache.set(source, item);
      }
      out.push(item);
    }
    return out;
  }

  private mediaKindForUrl(url: string): 'image' | 'video' {
    const pathOnly = url.split(/[?#]/)[0]?.toLowerCase() ?? '';
    if (/\.(mp4|webm|mov|m4v|mkv|avi)(\s|$)/.test(pathOnly)) return 'video';
    return 'image';
  }

  private resolveAbsoluteMediaHref(raw: string): string {
    return resolveAbsoluteMediaUrlFromConfig(raw, this.config);
  }

  async updatePost(payload: {
    postId: string;
    content?: string;
    scheduledFor?: string | null;
    title?: string;
    publishNow?: boolean;
    mediaUrls?: string[] | null;
  }): Promise<{ success: boolean }> {
    const postId = payload.postId.trim();
    if (!postId) {
      throw new Error('Zernio update failed: missing postId');
    }

    this.logger.log(`[REST] PUT /posts/${postId}`);

    const body: Record<string, unknown> = {};
    if (payload.content !== undefined) body.content = payload.content;
    if (payload.publishNow === true) body.publishNow = true;
    if (payload.scheduledFor !== undefined) {
      if (payload.scheduledFor !== null) {
        body.scheduledFor = payload.scheduledFor;
        body.timezone = 'UTC';
      } else {
        // Clear Zernio-owned schedule (Mosonic scheduler owns timing).
        body.scheduledFor = null;
      }
    }
    if (payload.title !== undefined) body.title = payload.title;

    if (payload.mediaUrls !== undefined) {
      const rawUrls = (payload.mediaUrls ?? [])
        .map((u) => u.trim())
        .filter(Boolean);
      const mediaCache = new Map<string, ZernioCustomMediaItem>();
      body.mediaItems = await this.buildZernioMediaItemsFromUrls(
        rawUrls,
        mediaCache,
      );
    }

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
      const { data } = await this.http.get<Record<string, unknown>>(
        `/posts/${id}`,
      );
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

  async getPostAnalytics(
    postId: string,
    opts?: { fromDate?: string; toDate?: string },
  ): Promise<unknown | null> {
    const id = postId.trim();
    if (!id) return null;

    // Zernio docs: GET /v1/analytics (query param `postId`), not /analytics/:id.
    // Accepts both Zernio post ids and external ids (auto-resolved).
    this.logger.log(`[REST] GET /analytics?postId=${id}`);

    try {
      const fromDate = toZernioDateOnly(opts?.fromDate);
      const toDate = toZernioDateOnly(opts?.toDate);
      const { data } = await this.http.get(`/analytics`, {
        params: {
          postId: id,
          ...(fromDate ? { fromDate } : {}),
          ...(toDate ? { toDate } : {}),
        },
      });
      if (data == null) return null;
      if (
        data &&
        typeof data === 'object' &&
        String((data as Record<string, unknown>).syncStatus ?? '')
          .trim()
          .toLowerCase() === 'pending'
      ) {
        this.logger.log(`[REST] Analytics for ${id} sync pending (body)`);
        return null;
      }
      return data;
    } catch (err: unknown) {
      if (isAxiosError(err)) {
        const status = err.response?.status;
        // Zernio may return:
        // - 202 when sync is pending
        // - 424 when all platforms failed
        // - 404 when post/analytics is not found
        if (status === 202) {
          this.logger.log(`[REST] Analytics for ${id} sync pending (202)`);
          return null;
        }
        if (status === 424) {
          this.logger.warn(
            `[REST] Analytics for ${id} failed on all platforms (424)`,
          );
          return null;
        }
        if (status === 404) {
          this.logger.warn(`[REST] Analytics for ${id} not found`);
          return null;
        }
      }
      const detail = summarizeZernioAxiosError(err);
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Zernio REST getPostAnalytics(${id}) threw: ${detail ? `${message} (${detail})` : message}`,
      );
      throw err;
    }
  }

  /** Platforms where Zernio does not support POST /posts/:id/unpublish. */
  private static readonly UNPUBLISH_UNSUPPORTED = new Set([
    'instagram',
    'tiktok',
    'snapchat',
  ]);

  /**
   * DELETE /v1/posts/{postId} — draft/scheduled posts only (not published).
   */
  async deletePost(zernioPostId: string): Promise<{ success: boolean }> {
    const id = zernioPostId.trim();
    if (!id) {
      throw new Error('Zernio delete failed: missing postId');
    }
    this.logger.log(`[REST] DELETE /posts/${id}`);
    try {
      await this.http.delete(`/posts/${encodeURIComponent(id)}`);
      return { success: true };
    } catch (err: unknown) {
      if (isAxiosError(err) && err.response?.status === 404) {
        this.logger.warn(
          `[REST] Post ${id} not found on Zernio (404), treating as success`,
        );
        return { success: true };
      }
      const detail = summarizeZernioAxiosError(err);
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Zernio REST deletePost(${id}) threw: ${message}`);
      throw new Error(
        detail
          ? `Could not delete post on Zernio — ${detail}`
          : message || 'Zernio delete failed',
      );
    }
  }

  /**
   * POST /v1/posts/{postId}/unpublish — removes published content from a platform.
   */
  async unpublishPost(
    zernioPostId: string,
    platform: string,
  ): Promise<{ success: boolean; notSupported?: boolean }> {
    const id = zernioPostId.trim();
    const plat = platform.trim().toLowerCase();
    if (!id) {
      throw new Error('Zernio unpublish failed: missing postId');
    }
    if (!plat) {
      throw new Error('Zernio unpublish failed: missing platform');
    }

    if (ZernioRestClient.UNPUBLISH_UNSUPPORTED.has(plat)) {
      this.logger.warn(`[REST] Unpublish not supported on ${platform}`);
      return { success: false, notSupported: true };
    }

    this.logger.log(`[REST] POST /posts/${id}/unpublish (${platform})`);
    try {
      await this.http.post(`/posts/${encodeURIComponent(id)}/unpublish`, {
        platform: plat,
      });
      return { success: true };
    } catch (err: unknown) {
      if (isAxiosError(err) && err.response?.status === 404) {
        this.logger.warn(
          `[REST] Post ${id} not found on Zernio for unpublish (404), treating as success`,
        );
        return { success: true };
      }
      const detail = summarizeZernioAxiosError(err);
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Zernio REST unpublishPost(${id}, ${plat}) threw: ${message}`,
      );
      throw new Error(
        detail
          ? `Could not unpublish on ${platform} — ${detail}`
          : message || 'Zernio unpublish failed',
      );
    }
  }

  /**
   * DELETE /v1/accounts/{accountId} — removes the connected social account on Zernio.
   * @see https://docs.zernio.com
   */
  async deleteAccount(accountId: string): Promise<void> {
    const id = accountId.trim();
    if (!id) {
      throw new Error('Zernio disconnect failed: missing accountId');
    }
    const path = `/accounts/${encodeURIComponent(id)}`;
    this.logger.log(`[REST] DELETE ${path}`);
    try {
      await this.http.delete(path);
    } catch (err: unknown) {
      if (isAxiosError(err) && err.response?.status === 404) {
        this.logger.warn(
          `Zernio REST deleteAccount(${id}): already removed (404), treating as success`,
        );
        return;
      }
      const detail = summarizeZernioAxiosError(err);
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Zernio REST deleteAccount(${id}) threw: ${message}`);
      throw new Error(
        detail
          ? `Could not disconnect account on Zernio — ${detail}`
          : message || 'Zernio disconnect failed',
      );
    }
  }
}
