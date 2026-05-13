import {
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Model } from 'mongoose';
import { EventsService } from '../events/events.service';
import {
  Upload,
  UploadChannelStatus,
  UploadJobStatus,
  type UploadChannelEntry,
  type UploadDocument,
} from '../upload/schemas/upload.schema';
import {
  buildUploadStatusSummary,
  recomputeUploadJobStatus,
} from '../upload/upload-status.util';
import { UsersService } from '../users/users.service';
import { WebhookEvent, type WebhookEventDocument } from './webhook-event.schema';

function isDuplicateKeyError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: number }).code;
  if (code === 11000) return true;
  const name = (err as { name?: string }).name;
  if (name === 'MongoServerError' && code === 11000) return true;
  return false;
}

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

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectModel(WebhookEvent.name)
    private readonly webhookEventModel: Model<WebhookEventDocument>,
    @InjectModel(Upload.name)
    private readonly uploadModel: Model<UploadDocument>,
    private readonly events: EventsService,
    private readonly usersService: UsersService,
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

    try {
      await this.webhookEventModel.create({
        eventId,
        event: eventName,
        processedAt: new Date(),
      });
    } catch (err: unknown) {
      if (isDuplicateKeyError(err)) return;
      throw err;
    }

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

  private async findUploadByPostId(
    postId: string,
  ): Promise<UploadDocument | null> {
    return this.uploadModel
      .findOne({ channels: { $elemMatch: { zernioPostId: postId } } })
      .exec();
  }

  private emitUpload(
    uploadId: string,
    event: string,
    body: Record<string, unknown>,
  ): void {
    this.events.emitToRoom(`upload_${uploadId}`, event, body);
  }

  private async saveUploadEmitAll(
    doc: UploadDocument,
    options: { publishNowHint?: boolean; scheduledAtHint?: string | null },
  ): Promise<void> {
    doc.status = recomputeUploadJobStatus(doc.channels);
    await doc.save();

    const status = doc.status;
    if (status === UploadJobStatus.Completed || status === UploadJobStatus.Partial) {
      const channelsPublished = doc.channels
        .filter((c) => c.status === UploadChannelStatus.Published)
        .map((c) => c.channel.toLowerCase());
      this.emitUpload(doc.uploadId, 'upload:all_completed', {
        uploadId: doc.uploadId,
        publishNow: options.publishNowHint ?? true,
        scheduledAt: options.scheduledAtHint ?? null,
        channelsPublished,
        summary: buildUploadStatusSummary(doc.channels),
      });
    }
  }

  private rowKey(ch: UploadChannelEntry): string {
    return ch.channel.trim().toLowerCase();
  }

  private async handlePostPublished(
    payload: Record<string, unknown>,
  ): Promise<void> {
    const post = payload.post;
    const postId = extractPostId(post);
    if (!postId) return;
    const doc = await this.findUploadByPostId(postId);
    if (!doc) return;
    const at = parseDate(payload.timestamp);

    for (const ch of doc.channels) {
      if (ch.status === UploadChannelStatus.Skipped) continue;
      ch.status = UploadChannelStatus.Published;
      ch.publishedAt = at;
      ch.scheduledAt = null;
      ch.failureReason = null;
      ch.zernioPostId = postId;
      const key = this.rowKey(ch);
      this.emitUpload(doc.uploadId, 'upload:completed', {
        uploadId: doc.uploadId,
        channel: key,
        postId,
      });
    }
    doc.markModified('channels');
    await this.saveUploadEmitAll(doc, {
      publishNowHint: true,
      scheduledAtHint: null,
    });
  }

  private async handlePostFailed(payload: Record<string, unknown>): Promise<void> {
    const postId = extractPostId(payload.post);
    if (!postId) return;
    const doc = await this.findUploadByPostId(postId);
    if (!doc) return;
    const msg = 'Publishing failed on platform.';

    for (const ch of doc.channels) {
      if (ch.status === UploadChannelStatus.Skipped) continue;
      ch.status = UploadChannelStatus.Failed;
      ch.failureReason = msg;
      this.emitUpload(doc.uploadId, 'upload:failed', {
        uploadId: doc.uploadId,
        channel: this.rowKey(ch),
        message: 'Publishing failed. Please retry.',
      });
    }
    doc.markModified('channels');
    await this.saveUploadEmitAll(doc, {});
  }

  private async handlePostPartial(payload: Record<string, unknown>): Promise<void> {
    const postId = extractPostId(payload.post);
    if (!postId) return;
    const doc = await this.findUploadByPostId(postId);
    if (!doc) return;
    const post = payload.post as Record<string, unknown> | undefined;
    const platforms = Array.isArray(post?.platforms)
      ? (post.platforms as unknown[])
      : [];
    const at = parseDate(payload.timestamp);

    for (const item of platforms) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      const platform = String(row.platform ?? '')
        .trim()
        .toLowerCase();
      if (!platform) continue;
      const isPublished =
        String(row.status ?? '')
          .trim()
          .toLowerCase() === 'published';
      const ch = doc.channels.find((c) => this.rowKey(c) === platform);
      if (!ch || ch.status === UploadChannelStatus.Skipped) continue;

      if (isPublished) {
        ch.status = UploadChannelStatus.Published;
        ch.publishedAt = at;
        ch.scheduledAt = null;
        ch.failureReason = null;
        ch.zernioPostId = postId;
        this.emitUpload(doc.uploadId, 'upload:completed', {
          uploadId: doc.uploadId,
          channel: platform,
          postId,
        });
      } else {
        ch.status = UploadChannelStatus.Failed;
        const err =
          typeof row.error === 'string' && row.error.trim()
            ? row.error.trim()
            : 'Publishing failed on platform.';
        ch.failureReason = err;
        this.emitUpload(doc.uploadId, 'upload:failed', {
          uploadId: doc.uploadId,
          channel: platform,
          message: 'Publishing failed. Please retry.',
        });
      }
    }
    doc.markModified('channels');
    await this.saveUploadEmitAll(doc, {});
  }

  private async handlePostScheduled(
    payload: Record<string, unknown>,
  ): Promise<void> {
    const postId = extractPostId(payload.post);
    if (!postId) return;
    const doc = await this.findUploadByPostId(postId);
    if (!doc) return;
    const post = payload.post as Record<string, unknown> | undefined;
    const scheduledRaw = post?.scheduledFor;
    const scheduledAt =
      scheduledRaw !== undefined && scheduledRaw !== null
        ? parseDate(scheduledRaw)
        : null;

    for (const ch of doc.channels) {
      if (ch.status === UploadChannelStatus.Skipped) continue;
      ch.status = UploadChannelStatus.Scheduled;
      ch.zernioPostId = postId;
      ch.scheduledAt = scheduledAt;
      ch.publishedAt = null;
      ch.failureReason = null;
      this.emitUpload(doc.uploadId, 'upload:scheduled', {
        uploadId: doc.uploadId,
        channel: this.rowKey(ch),
        scheduledAt: scheduledAt ? scheduledAt.toISOString() : '',
        postId,
      });
    }
    doc.markModified('channels');
    await this.saveUploadEmitAll(doc, {
      publishNowHint: false,
      scheduledAtHint: scheduledAt ? scheduledAt.toISOString() : null,
    });
  }

  private async handlePostCancelled(
    payload: Record<string, unknown>,
  ): Promise<void> {
    const postId = extractPostId(payload.post);
    if (!postId) return;
    const doc = await this.findUploadByPostId(postId);
    if (!doc) return;
    const msg = 'Post was cancelled.';

    for (const ch of doc.channels) {
      if (
        ch.status === UploadChannelStatus.Skipped ||
        ch.status === UploadChannelStatus.Published
      ) {
        continue;
      }
      ch.status = UploadChannelStatus.Failed;
      ch.failureReason = msg;
      this.emitUpload(doc.uploadId, 'upload:failed', {
        uploadId: doc.uploadId,
        channel: this.rowKey(ch),
        message: msg,
      });
    }
    doc.markModified('channels');
    await this.saveUploadEmitAll(doc, {});
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
