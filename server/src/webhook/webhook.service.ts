import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { EventsService } from '../events/events.service';
import { PostAnalyticsService } from '../post/post-analytics.service';
import {
  PlatformPostStatus,
  PostStatus,
  type PlatformResult,
} from '../post/schemas/post.schema';
import type { IPostRepository } from '../repositories/interfaces/post.repository.interface';
import type { PostRecord } from '../repositories/interfaces/post.repository.interface';
import type { IUploadRepository } from '../repositories/interfaces/upload.repository.interface';
import type { UploadRecord } from '../repositories/interfaces/upload.repository.interface';
import type { IWebhookEventRepository } from '../repositories/interfaces/webhook-event.repository.interface';
import {
  POST_REPOSITORY,
  UPLOAD_REPOSITORY,
  WEBHOOK_EVENT_REPOSITORY,
} from '../repositories/tokens';
import {
  UploadChannelStatus,
  UploadJobStatus,
  type UploadChannelEntry,
} from '../upload/schemas/upload.schema';
import {
  postPlatformResults,
  uploadChannels,
  withPostPlatformResults,
  withUploadChannels,
} from '../upload/upload-record.util';
import {
  buildUploadStatusSummary,
  recomputeUploadJobStatus,
} from '../upload/upload-status.util';
import { UsersService } from '../users/users.service';

/** Strip optional `sha256=` prefix; Zernio may send raw hex digest. */
function signatureHeaderToBuffer(signature: string): Buffer {
  const s = signature.trim();
  const hex = s.toLowerCase().startsWith('sha256=') ? s.slice(7).trim() : s;
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) {
    throw new UnauthorizedException('Invalid signature format');
  }
  return Buffer.from(hex, 'hex');
}

function extractPostId(post: unknown): string | null {
  if (!post || typeof post !== 'object') return null;
  const o = post as Record<string, unknown>;
  const id = o._id ?? o.id;
  if (typeof id === 'string' && id.trim()) return id.trim();
  if (id && typeof id === 'object' && '$oid' in id) {
    const oid = (id as { $oid?: unknown }).$oid;
    if (typeof oid === 'string' && oid.trim()) return oid.trim();
  }
  return null;
}

function parseDate(value: unknown): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

function parsePlatformRows(
  postPayload: Record<string, unknown> | undefined,
): Record<string, unknown>[] {
  const platforms = Array.isArray(postPayload?.platforms)
    ? (postPayload!.platforms as unknown[])
    : [];
  return platforms.filter(
    (p): p is Record<string, unknown> => p !== null && typeof p === 'object',
  );
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly config: ConfigService,
    @Inject(WEBHOOK_EVENT_REPOSITORY)
    private readonly webhookEvents: IWebhookEventRepository,
    @Inject(UPLOAD_REPOSITORY)
    private readonly uploads: IUploadRepository,
    @Inject(POST_REPOSITORY)
    private readonly posts: IPostRepository,
    private readonly events: EventsService,
    private readonly usersService: UsersService,
    private readonly postAnalyticsService: PostAnalyticsService,
  ) {}

  /**
   * HMAC-SHA256 over the raw JSON body bytes. Header is hex digest (optional `sha256=` prefix).
   */
  verifySignature(signatureHeader: string | undefined, rawBody: Buffer): void {
    if (!signatureHeader?.trim()) {
      throw new UnauthorizedException('No signature provided');
    }
    const secret = this.config.get<string>('ZERNIO_WEBHOOK_SECRET')?.trim();
    if (!secret) {
      throw new InternalServerErrorException('Webhook secret not configured');
    }
    const expected = createHmac('sha256', secret).update(rawBody).digest();
    let provided: Buffer;
    try {
      provided = signatureHeaderToBuffer(signatureHeader);
    } catch {
      throw new UnauthorizedException('Invalid webhook signature');
    }
    if (provided.length !== expected.length) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
    if (!timingSafeEqual(provided, expected)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
  }

  async handleEvent(eventId: string, rawBody: Buffer): Promise<void> {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
    } catch {
      this.logger.warn(`Webhook ${eventId}: invalid JSON body`);
      return;
    }
    const eventName = typeof payload.event === 'string' ? payload.event : '';
    if (!eventName) {
      this.logger.warn(`Webhook ${eventId}: missing event field`);
      return;
    }

    const recorded = await this.webhookEvents.tryRecord(
      eventId,
      eventName,
      new Date(),
    );
    if (recorded === 'duplicate') return;

    switch (eventName) {
      case 'post.published':
        await this.handlePostPublished(payload);
        break;
      case 'post.failed':
        await this.handlePostFailed(payload);
        break;
      case 'post.partial':
        await this.handlePostPartial(payload);
        break;
      case 'post.scheduled':
        await this.handlePostScheduled(payload);
        break;
      case 'post.cancelled':
        await this.handlePostCancelled(payload);
        break;
      case 'account.connected':
        await this.handleAccountConnected(payload);
        break;
      case 'account.disconnected':
        await this.handleAccountDisconnected(payload);
        break;
      default:
        break;
    }
  }

  private emitUpload(
    uploadId: string,
    event: string,
    body: Record<string, unknown>,
  ): void {
    this.events.emitToRoom(`upload_${uploadId}`, event, body);
  }

  private remainingScheduledHint(upload: UploadRecord): string | null {
    const remaining = uploadChannels(upload).find(
      (c) => c.status === UploadChannelStatus.Scheduled && c.scheduledAt,
    );
    if (!remaining?.scheduledAt) return null;
    const at =
      remaining.scheduledAt instanceof Date
        ? remaining.scheduledAt
        : new Date(remaining.scheduledAt as string);
    return at.toISOString();
  }

  private async saveUploadEmitAll(
    upload: UploadRecord,
    options: { publishNowHint?: boolean; scheduledAtHint?: string | null },
  ): Promise<void> {
    const channels = uploadChannels(upload);
    const saved = await this.uploads.save({
      ...withUploadChannels(upload, channels),
      status: recomputeUploadJobStatus(channels),
    });

    const status = saved.status;
    if (status === UploadJobStatus.Completed || status === UploadJobStatus.Partial) {
      const channelsPublished = uploadChannels(saved)
        .filter((c) => c.status === UploadChannelStatus.Published)
        .map((c) => c.channel.toLowerCase());
      this.emitUpload(saved.uploadId, 'upload:all_completed', {
        uploadId: saved.uploadId,
        publishNow: options.publishNowHint ?? true,
        scheduledAt: options.scheduledAtHint ?? null,
        channelsPublished,
        summary: buildUploadStatusSummary(uploadChannels(saved)),
      });
    }
  }

  private rowKey(ch: UploadChannelEntry): string {
    return ch.channel.trim().toLowerCase();
  }

  private platformKeySet(post: PostRecord): Set<string> {
    return new Set(
      (post.channels ?? []).map((c) => String(c).trim().toLowerCase()),
    );
  }

  private publishedPlatformResults(
    channels: string[],
    at: Date,
    payloadRows: Record<string, unknown>[],
  ): PlatformResult[] {
    return channels.map((platform) => {
      const row = payloadRows.find(
        (r) =>
          String(r.platform ?? '')
            .trim()
            .toLowerCase() === platform,
      );
      const url =
        typeof row?.url === 'string' && row.url.trim()
          ? row.url.trim()
          : null;
      const publishedAt =
        row?.publishedAt !== undefined && row?.publishedAt !== null
          ? parseDate(row.publishedAt)
          : at;
      return {
        platform,
        status: PlatformPostStatus.Published,
        platformUrl: url,
        publishedAt,
        failureReason: null,
      };
    });
  }

  private async handlePostPublished(
    payload: Record<string, unknown>,
  ): Promise<void> {
    const postPayload = payload.post as Record<string, unknown> | undefined;
    const zernioPostId = extractPostId(postPayload);
    if (!zernioPostId) return;
    const post = await this.posts.findByZernioPostId(zernioPostId);
    if (!post) return;

    const at = parseDate(payload.timestamp);
    const rows = parsePlatformRows(postPayload);
    const keys = this.platformKeySet(post);

    const platformResults: PlatformResult[] =
      rows.length > 0
        ? this.publishedPlatformResults([...keys], at, rows)
        : [...keys].map((platform) => ({
            platform,
            status: PlatformPostStatus.Published,
            platformUrl: null,
            publishedAt: at,
            failureReason: null,
          }));

    const savedPost = await this.posts.save({
      ...withPostPlatformResults(post, platformResults),
      status: PostStatus.Published,
      publishedAt: at,
      scheduledAt: null,
      failureReason: null,
    });
    await this.postAnalyticsService.ensureForPost(savedPost);

    const upload = await this.uploads.findByUploadId(post.uploadRef);
    if (!upload) return;

    let channels = uploadChannels(upload);
    for (const ch of channels) {
      if (!keys.has(this.rowKey(ch))) continue;
      if (ch.status === UploadChannelStatus.Skipped) continue;
      ch.status = UploadChannelStatus.Published;
      ch.publishedAt = at;
      ch.scheduledAt = null;
      ch.failureReason = null;
      this.emitUpload(upload.uploadId, 'upload:completed', {
        uploadId: upload.uploadId,
        channel: this.rowKey(ch),
        postId: zernioPostId,
      });
    }
    await this.saveUploadEmitAll(withUploadChannels(upload, channels), {
      publishNowHint: true,
      scheduledAtHint: this.remainingScheduledHint(
        withUploadChannels(upload, channels),
      ),
    });
  }

  private async handlePostFailed(payload: Record<string, unknown>): Promise<void> {
    const zernioPostId = extractPostId(payload.post);
    if (!zernioPostId) return;
    const post = await this.posts.findByZernioPostId(zernioPostId);
    if (!post) return;

    const msg =
      typeof payload.error === 'string' && payload.error.trim()
        ? payload.error.trim()
        : 'Publishing failed on platform.';

    const keys = this.platformKeySet(post);
    const platformResults: PlatformResult[] = [...keys].map((platform) => ({
      platform,
      status: PlatformPostStatus.Failed,
      platformUrl: null,
      publishedAt: null,
      failureReason: msg,
    }));

    await this.posts.save(
      withPostPlatformResults(
        { ...post, status: PostStatus.Failed, failureReason: msg },
        platformResults,
      ),
    );

    const upload = await this.uploads.findByUploadId(post.uploadRef);
    if (!upload) return;

    const channels = uploadChannels(upload);
    for (const ch of channels) {
      if (!keys.has(this.rowKey(ch))) continue;
      if (ch.status === UploadChannelStatus.Skipped) continue;
      ch.status = UploadChannelStatus.Failed;
      ch.failureReason = msg;
      this.emitUpload(upload.uploadId, 'upload:failed', {
        uploadId: upload.uploadId,
        channel: this.rowKey(ch),
        message: 'Publishing failed. Please retry.',
      });
    }
    await this.saveUploadEmitAll(withUploadChannels(upload, channels), {});
  }

  private async handlePostPartial(payload: Record<string, unknown>): Promise<void> {
    const zernioPostId = extractPostId(payload.post);
    if (!zernioPostId) return;
    const post = await this.posts.findByZernioPostId(zernioPostId);
    if (!post) return;

    const postPayload = payload.post as Record<string, unknown> | undefined;
    const platforms = parsePlatformRows(postPayload);
    const at = parseDate(payload.timestamp);
    const keys = this.platformKeySet(post);

    const platformResults: PlatformResult[] = [...keys].map((platform) => {
      const row = platforms.find(
        (item) =>
          String(item.platform ?? '')
            .trim()
            .toLowerCase() === platform,
      );
      if (
        row &&
        String(row.status ?? '')
          .trim()
          .toLowerCase() === 'published'
      ) {
        const err =
          typeof row.error === 'string' && row.error.trim()
            ? row.error.trim()
            : null;
        const url =
          typeof row.url === 'string' && row.url.trim()
            ? row.url.trim()
            : null;
        return {
          platform,
          status: PlatformPostStatus.Published,
          platformUrl: url,
          publishedAt:
            row.publishedAt !== undefined && row.publishedAt !== null
              ? parseDate(row.publishedAt)
              : at,
          failureReason: err,
        };
      }
      if (row) {
        const err =
          typeof row.error === 'string' && row.error.trim()
            ? row.error.trim()
            : 'Publishing failed on platform.';
        return {
          platform,
          status: PlatformPostStatus.Failed,
          platformUrl: null,
          publishedAt: null,
          failureReason: err,
        };
      }
      return {
        platform,
        status: PlatformPostStatus.Pending,
        platformUrl: null,
        publishedAt: null,
        failureReason: null,
      };
    });

    const savedPost = await this.posts.save(
      withPostPlatformResults(
        { ...post, status: PostStatus.Partial },
        platformResults,
      ),
    );
    await this.postAnalyticsService.ensureForPost(savedPost);

    const upload = await this.uploads.findByUploadId(post.uploadRef);
    if (!upload) return;

    const channels = uploadChannels(upload);
    for (const row of platforms) {
      const platform = String(row.platform ?? '')
        .trim()
        .toLowerCase();
      if (!platform || !keys.has(platform)) continue;
      const isPublished =
        String(row.status ?? '')
          .trim()
          .toLowerCase() === 'published';
      const ch = channels.find((c) => this.rowKey(c) === platform);
      if (!ch || ch.status === UploadChannelStatus.Skipped) continue;

      if (isPublished) {
        ch.status = UploadChannelStatus.Published;
        ch.publishedAt = at;
        ch.scheduledAt = null;
        ch.failureReason = null;
        this.emitUpload(upload.uploadId, 'upload:completed', {
          uploadId: upload.uploadId,
          channel: platform,
          postId: zernioPostId,
        });
      } else {
        ch.status = UploadChannelStatus.Failed;
        const err =
          typeof row.error === 'string' && row.error.trim()
            ? row.error.trim()
            : 'Publishing failed on platform.';
        ch.failureReason = err;
        this.emitUpload(upload.uploadId, 'upload:failed', {
          uploadId: upload.uploadId,
          channel: platform,
          message: 'Publishing failed. Please retry.',
        });
      }
    }
    await this.saveUploadEmitAll(withUploadChannels(upload, channels), {});
  }

  private async handlePostScheduled(
    payload: Record<string, unknown>,
  ): Promise<void> {
    const zernioPostId = extractPostId(payload.post);
    if (!zernioPostId) return;
    const post = await this.posts.findByZernioPostId(zernioPostId);
    if (!post) return;

    const postPayload = payload.post as Record<string, unknown> | undefined;
    const scheduledRaw = postPayload?.scheduledFor;
    const scheduledAt =
      scheduledRaw !== undefined && scheduledRaw !== null
        ? parseDate(scheduledRaw)
        : null;

    const keys = this.platformKeySet(post);
    const platformResults: PlatformResult[] = [...keys].map((platform) => ({
      platform,
      status: PlatformPostStatus.Scheduled,
      platformUrl: null,
      publishedAt: null,
      failureReason: null,
    }));

    await this.posts.save(
      withPostPlatformResults(
        {
          ...post,
          status: PostStatus.Scheduled,
          scheduledAt,
          publishedAt: null,
          failureReason: null,
        },
        platformResults,
      ),
    );

    const upload = await this.uploads.findByUploadId(post.uploadRef);
    if (!upload) return;

    const channels = uploadChannels(upload);
    for (const ch of channels) {
      if (!keys.has(this.rowKey(ch))) continue;
      if (ch.status === UploadChannelStatus.Skipped) continue;
      ch.status = UploadChannelStatus.Scheduled;
      ch.scheduledAt = scheduledAt;
      ch.publishedAt = null;
      ch.failureReason = null;
      this.emitUpload(upload.uploadId, 'upload:scheduled', {
        uploadId: upload.uploadId,
        channel: this.rowKey(ch),
        scheduledAt: scheduledAt ? scheduledAt.toISOString() : '',
        postId: zernioPostId,
      });
    }
    const updatedUpload = withUploadChannels(upload, channels);
    await this.saveUploadEmitAll(updatedUpload, {
      publishNowHint: false,
      scheduledAtHint: scheduledAt
        ? scheduledAt.toISOString()
        : this.remainingScheduledHint(updatedUpload),
    });
  }

  private async handlePostCancelled(
    payload: Record<string, unknown>,
  ): Promise<void> {
    const zernioPostId = extractPostId(payload.post);
    if (!zernioPostId) return;
    const post = await this.posts.findByZernioPostId(zernioPostId);
    if (!post) return;

    const msg = 'Post was cancelled.';
    const keys = this.platformKeySet(post);
    const platformResults: PlatformResult[] = [...keys].map((platform) => ({
      platform,
      status: PlatformPostStatus.Cancelled,
      platformUrl: null,
      publishedAt: null,
      failureReason: msg,
    }));

    await this.posts.save(
      withPostPlatformResults(
        { ...post, status: PostStatus.Cancelled, failureReason: msg },
        platformResults,
      ),
    );

    const upload = await this.uploads.findByUploadId(post.uploadRef);
    if (!upload) return;

    const channels = uploadChannels(upload);
    for (const ch of channels) {
      if (!keys.has(this.rowKey(ch))) continue;
      if (
        ch.status === UploadChannelStatus.Skipped ||
        ch.status === UploadChannelStatus.Published
      ) {
        continue;
      }
      ch.status = UploadChannelStatus.Failed;
      ch.failureReason = msg;
      this.emitUpload(upload.uploadId, 'upload:failed', {
        uploadId: upload.uploadId,
        channel: this.rowKey(ch),
        message: msg,
      });
    }
    await this.saveUploadEmitAll(withUploadChannels(upload, channels), {});
  }

  private async handleAccountConnected(
    payload: Record<string, unknown>,
  ): Promise<void> {
    const account = payload.account as Record<string, unknown> | undefined;
    const profileId =
      typeof account?.profileId === 'string' ? account.profileId : '';
    if (!profileId.trim()) return;
    const user = await this.usersService.findByZernioProfileId(profileId);
    if (!user) return;
    const platform = String(account?.platform ?? '').trim();
    const accountId = String(account?._id ?? account?.id ?? '').trim();
    if (!platform || !accountId) return;
    await this.usersService.setZernioConnectedAccount(
      user.userId,
      platform,
      accountId,
    );
  }

  private async handleAccountDisconnected(
    payload: Record<string, unknown>,
  ): Promise<void> {
    const account = payload.account as Record<string, unknown> | undefined;
    const profileId =
      typeof account?.profileId === 'string' ? account.profileId : '';
    if (!profileId.trim()) return;
    const user = await this.usersService.findByZernioProfileId(profileId);
    if (!user) return;
    const platform = String(account?.platform ?? '').trim();
    if (!platform) return;
    await this.usersService.disconnectZernioConnectedAccount(
      user.userId,
      platform,
    );
  }
}
