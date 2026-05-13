import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { TenancyAuth } from '../auth/tenancy.types';
import { mergeUserIdFilter } from '../auth/tenancy.util';
import { UserRole } from '../users/schemas/user.schema';
import type { ResolvedContentOutputs } from '../content/content-output.utils';
import { ContentService } from '../content/content.service';
import { EventsService } from '../events/events.service';
import { McpService } from '../mcp/mcp.service';
import { getFriendlyZernioPublishError } from '../mcp/zernio/zernio-mcp-publish.util';
import type { ChannelEntry } from '../rule/schemas/rule.schema';
import type {
  ChannelPublishDto,
  PublishUploadDto,
} from './dto/publish-upload.dto';
import type { PatchUploadChannelBodyDto } from './dto/patch-upload-channel.dto';
import type { UpdateUploadDto } from './dto/update-upload.dto';
import type {
  UploadStatusDto,
  UploadStatusSummaryDto,
} from './dto/upload-status.dto';
import {
  Upload,
  UploadChannelStatus,
  UploadJobStatus,
  type UploadChannelEntry,
  type UploadDocument,
} from './schemas/upload.schema';
import { normalizedRuleChannelMapping } from '../rule/rule-mapping.util';
import {
  resolveAutomappedCaption,
  resolveAutomappedMediaUrl,
} from './upload-channel-publish.util';
import {
  buildUploadStatusSummary,
  recomputeUploadJobStatus,
} from './upload-status.util';

export type CreateUploadParams = {
  userId: string;
  contentRef: string;
  workflowRef: string;
  ruleRef: string;
  resolvedOutputs: ResolvedContentOutputs;
  ruleChannels: ChannelEntry[];
};

export type UploadChannelDto = {
  channel: string;
  included: boolean;
  status: UploadChannelStatus;
  caption: string;
  mediaUrl: string | null;
  mediaUrls: string[];
  youtubeTitle: string | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  zernioPostId: string | null;
  failureReason: string | null;
};

export type UploadDetailDto = {
  uploadId: string;
  contentRef: string;
  status: UploadJobStatus;
  channels: UploadChannelDto[];
  resolvedOutputs: ResolvedContentOutputs;
};

export type PublishUploadResult = { success: true };

export type PatchUploadChannelResult = { success: true };

export type UpdateUploadResult = { success: true };

const FAILURE_REASON_MAX = 500;

/** Raw BSON may still contain pre-refactor keys; Mongoose drops them on hydrate. */
type LegacyRawChannel = Record<string, unknown>;

@Injectable()
export class UploadService {
  constructor(
    @InjectModel(Upload.name)
    private readonly uploadModel: Model<UploadDocument>,
    private readonly mcpService: McpService,
    private readonly events: EventsService,
    @Inject(forwardRef(() => ContentService))
    private readonly contentService: ContentService,
  ) {}

  buildChannelEntriesFromRule(
    ruleChannels: ChannelEntry[],
    resolvedOutputs: ResolvedContentOutputs,
  ): UploadChannelEntry[] {
    const ro = resolvedOutputs ?? {};
    return ruleChannels.map((ruleCh) => {
      const map = normalizedRuleChannelMapping(ruleCh);
      const caption = resolveAutomappedCaption(map.caption, ro);
      const mediaUrl = resolveAutomappedMediaUrl(map.media, ro);
      return {
        channel: ruleCh.channel,
        included: true,
        caption,
        mediaUrl,
        mediaUrls: [],
        youtubeTitle: null,
        status: UploadChannelStatus.Pending,
        zernioPostId: null,
        scheduledAt: null,
        publishedAt: null,
        retryCount: 0,
        failureReason: null,
      };
    });
  }

  private createDefaultChannelRow(
    channel: string,
    resolvedOutputs: ResolvedContentOutputs,
  ): UploadChannelEntry {
    const ro = resolvedOutputs ?? {};
    const fallbackCaption = this.fallbackPrimaryCaption(ro);
    const fallbackMedia = (ro.image?.trim() || ro.video?.trim() || null) as
      | string
      | null;
    return {
      channel,
      included: true,
      caption: fallbackCaption,
      mediaUrl: fallbackMedia,
      mediaUrls: [],
      youtubeTitle: null,
      status: UploadChannelStatus.Pending,
      zernioPostId: null,
      scheduledAt: null,
      publishedAt: null,
      retryCount: 0,
      failureReason: null,
    };
  }

  private async ensureChannelsForConnectedAccounts(
    doc: UploadDocument,
    userId: string,
  ): Promise<boolean> {
    const connected = await this.mcpService.getConnectedAccounts(userId);
    const connectedKeys = new Set(
      (connected.accounts ?? [])
        .map((a) => a.channel?.trim().toLowerCase())
        .filter(Boolean),
    );
    if (connectedKeys.size === 0) return false;

    const existingKeys = new Set(
      (doc.channels ?? []).map((c) => c.channel.toLowerCase()),
    );
    let changed = false;
    const ro = doc.resolvedOutputs ?? {};

    for (const key of connectedKeys) {
      if (existingKeys.has(key)) continue;
      // Normalize display casing based on existing tabs (capitalize first) for UI consistency.
      const channelName = key[0] ? `${key[0].toUpperCase()}${key.slice(1)}` : key;
      doc.channels.push(this.createDefaultChannelRow(channelName, ro));
      changed = true;
    }

    if (changed) {
      doc.status = recomputeUploadJobStatus(doc.channels);
      doc.markModified('channels');
      await doc.save();
    }
    return changed;
  }

  /**
   * When refreshing channels from the rule (e.g. draft → approve), keep per-channel
   * user edits from the previous snapshot so PATCHed media/caption are not wiped.
   */
  mergeChannelsPreservingUserEdits(
    fresh: UploadChannelEntry[],
    previous: UploadChannelEntry[],
  ): UploadChannelEntry[] {
    const prevByKey = new Map(
      previous.map((ch) => [ch.channel.toLowerCase(), ch]),
    );
    return fresh.map((row) => {
      const prev = prevByKey.get(row.channel.toLowerCase());
      if (!prev) {
        return row;
      }

      const hadUserMedia =
        (prev.mediaUrl ?? '').trim().length > 0 ||
        (prev.mediaUrls?.some((u) => (u ?? '').trim().length > 0) ?? false);

      const prevCap = (prev.caption ?? '').trim();
      const freshCap = (row.caption ?? '').trim();
      const keepCaption = prevCap.length > 0 && prevCap !== freshCap;

      const prevYt = (prev.youtubeTitle ?? '').trim();

      return {
        ...row,
        ...(hadUserMedia
          ? {
              mediaUrl: prev.mediaUrl ?? null,
              mediaUrls: [...(prev.mediaUrls ?? [])],
            }
          : {}),
        ...(keepCaption ? { caption: prev.caption } : {}),
        ...(prevYt.length > 0 ? { youtubeTitle: prev.youtubeTitle } : {}),
      };
    });
  }

  async createUpload(
    params: CreateUploadParams,
  ): Promise<{ uploadId: string }> {
    const channels = this.buildChannelEntriesFromRule(
      params.ruleChannels,
      params.resolvedOutputs ?? {},
    );

    const doc = await this.uploadModel.create({
      userId: params.userId,
      contentRef: params.contentRef,
      workflowRef: params.workflowRef,
      ruleRef: params.ruleRef,
      channels,
      status: UploadJobStatus.Pending,
      resolvedOutputs: params.resolvedOutputs,
    });

    return { uploadId: doc.uploadId };
  }

  /**
   * Updates an existing upload created during draft review, or creates one for legacy rows.
   * Used when content is approved (refreshes channels + snapshot).
   */
  async refreshUploadForApprove(
    params: CreateUploadParams,
    auth: TenancyAuth,
  ): Promise<{ uploadId: string }> {
    const filter = mergeUserIdFilter({ contentRef: params.contentRef }, auth);
    const doc = await this.uploadModel
      .findOne(filter)
      .sort({ createdAt: -1 })
      .exec();
    const channels = this.buildChannelEntriesFromRule(
      params.ruleChannels,
      params.resolvedOutputs ?? {},
    );
    if (doc) {
      doc.resolvedOutputs = params.resolvedOutputs;
      doc.workflowRef = params.workflowRef;
      doc.ruleRef = params.ruleRef;
      doc.channels = this.mergeChannelsPreservingUserEdits(channels, doc.channels);
      doc.status = recomputeUploadJobStatus(doc.channels);
      await doc.save();
      await this.ensureChannelsForConnectedAccounts(doc, auth.userId);
      return { uploadId: doc.uploadId };
    }
    return this.createUpload(params);
  }

  /** Keeps upload palette in sync while content is edited (draft); does not rebuild channels. */
  async syncResolvedOutputsForContent(
    contentRef: string,
    auth: TenancyAuth,
    resolvedOutputs: ResolvedContentOutputs,
  ): Promise<void> {
    const filter = mergeUserIdFilter({ contentRef }, auth);
    const doc = await this.uploadModel
      .findOne(filter)
      .sort({ createdAt: -1 })
      .exec();
    if (!doc) {
      return;
    }
    doc.resolvedOutputs = resolvedOutputs;
    await doc.save();
  }

  /** Latest upload id per contentRef when multiple legacy rows exist. */
  async mapLatestUploadIdByContentRef(
    contentRefs: string[],
    auth: TenancyAuth,
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (contentRefs.length === 0) {
      return map;
    }
    const docs = await this.uploadModel
      .find(mergeUserIdFilter({ contentRef: { $in: contentRefs } }, auth))
      .sort({ createdAt: -1 })
      .select({ contentRef: 1, uploadId: 1 })
      .lean()
      .exec();
    for (const d of docs) {
      const ref = d.contentRef as string;
      const id = d.uploadId as string;
      if (!map.has(ref)) {
        map.set(ref, id);
      }
    }
    return map;
  }

  async findUploadIdByContentRef(
    contentRef: string,
    auth: TenancyAuth,
  ): Promise<{ uploadId: string }> {
    const filter = mergeUserIdFilter({ contentRef }, auth);
    const doc = await this.uploadModel
      .findOne(filter)
      .sort({ createdAt: -1 })
      .select({ uploadId: 1 })
      .lean()
      .exec();
    if (!doc) {
      throw new NotFoundException(`No upload found for content ${contentRef}`);
    }
    return { uploadId: doc.uploadId };
  }

  async findByUploadId(
    uploadId: string,
    auth: TenancyAuth,
  ): Promise<UploadDetailDto> {
    const doc = await this.uploadModel.findOne({ uploadId }).exec();
    if (!doc) {
      throw new NotFoundException(`Upload ${uploadId} not found`);
    }
    this.assertUploadAccess(doc, auth, uploadId);
    await this.migrateLegacyChannelsFromMongo(doc);
    await this.ensureChannelsForConnectedAccounts(doc, auth.userId);
    const roFallback = doc.resolvedOutputs ?? {};
    for (const ch of doc.channels) {
      this.coerceLegacyChannelRow(ch, roFallback);
    }
    return this.toDetailDto(doc);
  }

  async getUploadStatus(
    uploadId: string,
    auth: TenancyAuth,
  ): Promise<UploadStatusDto> {
    const detail = await this.findByUploadId(uploadId, auth);
    return {
      uploadId: detail.uploadId,
      status: detail.status,
      channels: detail.channels.map((ch) => ({
        ...ch,
        zernioPostId: ch.zernioPostId,
      })),
      summary: this.buildSummaryFromDto(detail.channels),
    };
  }

  /**
   * Persist-on-read: legacy docs stored autoCaption/overrideCaption/etc. on subdocuments.
   * Hydrated UploadChannelEntry omits those paths; merge from raw collection read once and save.
   */
  private async migrateLegacyChannelsFromMongo(
    doc: UploadDocument,
  ): Promise<void> {
    const rawDoc = (await this.uploadModel.collection.findOne(
      { uploadId: doc.uploadId },
      { projection: { channels: 1 } },
    )) as { channels?: LegacyRawChannel[] } | null;
    if (!rawDoc?.channels?.length) {
      return;
    }

    let changed = false;
    for (let i = 0; i < doc.channels.length; i++) {
      const row = doc.channels[i];
      const raw = rawDoc.channels[i];
      if (!raw || !row) {
        continue;
      }
      const hasLegacy =
        'autoCaption' in raw ||
        'overrideCaption' in raw ||
        'autoMediaUrl' in raw ||
        'overrideMediaUrl' in raw ||
        'overrideMediaUrls' in raw;
      if (!hasLegacy) {
        continue;
      }

      const legCap =
        this.strOrEmpty(raw['overrideCaption']) ||
        this.strOrEmpty(raw['autoCaption']);
      const legMedia =
        typeof raw['overrideMediaUrl'] === 'string'
          ? raw['overrideMediaUrl']
          : typeof raw['autoMediaUrl'] === 'string'
            ? raw['autoMediaUrl']
            : null;
      const legUrls = Array.isArray(raw['overrideMediaUrls'])
        ? (raw['overrideMediaUrls'] as unknown[]).filter(
            (u): u is string => typeof u === 'string',
          )
        : [];

      if (!(row.caption ?? '').trim() && legCap) {
        row.caption = legCap;
        changed = true;
      }

      const urls = row.mediaUrls ?? [];
      if (!urls.length && legUrls.length) {
        row.mediaUrls = [...legUrls];
        changed = true;
      }

      if (!(row.mediaUrl ?? '').trim()) {
        if (legMedia?.trim()) {
          row.mediaUrl = legMedia.trim();
          changed = true;
        } else if (legUrls[0]?.trim()) {
          row.mediaUrl = legUrls[0]!.trim();
          changed = true;
        }
      }
    }

    if (changed) {
      doc.markModified('channels');
      await doc.save();
    }
  }

  private strOrEmpty(v: unknown): string {
    return typeof v === 'string' ? v.trim() : '';
  }

  async patchUploadChannel(
    uploadId: string,
    channelParam: string,
    body: PatchUploadChannelBodyDto,
    auth: TenancyAuth,
  ): Promise<PatchUploadChannelResult> {
    const key = channelParam.trim().toLowerCase();
    if (!key) {
      throw new BadRequestException('channel is required');
    }

    const hasUpdate =
      body.included !== undefined ||
      body.caption !== undefined ||
      body.mediaUrl !== undefined ||
      body.mediaUrls !== undefined ||
      body.youtubeTitle !== undefined;
    if (!hasUpdate) {
      throw new BadRequestException('No fields to update');
    }

    const doc = await this.uploadModel.findOne({ uploadId }).exec();
    if (!doc) {
      throw new NotFoundException(`Upload ${uploadId} not found`);
    }
    this.assertUploadAccess(doc, auth, uploadId);
    await this.migrateLegacyChannelsFromMongo(doc);
    await this.ensureChannelsForConnectedAccounts(doc, auth.userId);

    const roFallback = doc.resolvedOutputs ?? {};
    for (const ch of doc.channels) {
      this.coerceLegacyChannelRow(ch, roFallback);
    }

    const row = doc.channels.find((c) => c.channel.toLowerCase() === key);
    if (!row) {
      throw new BadRequestException(`Unknown channel: ${channelParam}`);
    }

    if (body.included !== undefined) {
      row.included = Boolean(body.included);
    }
    if (body.caption !== undefined) {
      row.caption =
        body.caption === null ? '' : ((body.caption as string) ?? '');
    }
    if (body.mediaUrl !== undefined) {
      row.mediaUrl = body.mediaUrl;
    }
    if (body.mediaUrls !== undefined) {
      row.mediaUrls = [...body.mediaUrls];
    }
    if (body.youtubeTitle !== undefined) {
      row.youtubeTitle = body.youtubeTitle;
    }

    doc.status = recomputeUploadJobStatus(doc.channels);
    await doc.save();
    return { success: true };
  }

  async updateUpload(
    uploadId: string,
    body: UpdateUploadDto,
    auth: TenancyAuth,
  ): Promise<UpdateUploadResult> {
    const hasCaptionUpdate = body.caption !== undefined;
    const hasScheduleUpdate =
      body.scheduledAt !== undefined && body.scheduledAt !== null;
    const hasTitleUpdate = body.youtubeTitle !== undefined;

    if (!hasCaptionUpdate && !hasScheduleUpdate && !hasTitleUpdate) {
      throw new BadRequestException('No fields to update');
    }

    let scheduledDate: Date | null = null;
    let scheduledIso: string | undefined;
    if (hasScheduleUpdate) {
      const raw = body.scheduledAt?.trim();
      if (!raw) {
        throw new BadRequestException('scheduledAt is required to reschedule.');
      }
      scheduledDate = new Date(raw);
      if (Number.isNaN(scheduledDate.getTime())) {
        throw new BadRequestException('Invalid scheduledAt datetime.');
      }
      if (scheduledDate.getTime() <= Date.now()) {
        throw new BadRequestException('Scheduled time must be in the future.');
      }
      scheduledIso = scheduledDate.toISOString();
    }

    const doc = await this.uploadModel.findOne({ uploadId }).exec();
    if (!doc) {
      throw new NotFoundException(`Upload ${uploadId} not found`);
    }
    this.assertUploadAccess(doc, auth, uploadId);
    await this.migrateLegacyChannelsFromMongo(doc);

    const roFallback = doc.resolvedOutputs ?? {};
    for (const ch of doc.channels) {
      this.coerceLegacyChannelRow(ch, roFallback);
    }

    const scheduledChannels = doc.channels.filter(
      (ch) =>
        ch.status === UploadChannelStatus.Scheduled &&
        Boolean(ch.zernioPostId?.trim()),
    );
    if (scheduledChannels.length === 0) {
      throw new BadRequestException(
        'No scheduled post found. Only scheduled posts can be updated.',
      );
    }

    const scheduledYoutubeChannels = scheduledChannels.filter(
      (ch) => ch.channel.toLowerCase() === 'youtube',
    );
    if (hasTitleUpdate && scheduledYoutubeChannels.length === 0) {
      throw new BadRequestException(
        'No scheduled YouTube post found to update.',
      );
    }

    const content = hasCaptionUpdate
      ? body.caption === null
        ? ''
        : (body.caption ?? '')
      : undefined;
    const title = hasTitleUpdate
      ? body.youtubeTitle === null
        ? ''
        : (body.youtubeTitle ?? '')
      : undefined;
    const postIds = [
      ...new Set(
        scheduledChannels
          .map((ch) => ch.zernioPostId?.trim())
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    for (const postId of postIds) {
      await this.mcpService.updatePost({
        postId,
        content,
        scheduledFor: scheduledIso,
        title: hasTitleUpdate ? title : undefined,
      });
    }

    for (const ch of scheduledChannels) {
      if (hasCaptionUpdate) {
        ch.caption = content ?? '';
      }
      if (scheduledDate) {
        ch.scheduledAt = scheduledDate;
      }
      if (hasTitleUpdate && ch.channel.toLowerCase() === 'youtube') {
        ch.youtubeTitle = title ?? null;
      }
    }

    doc.status = recomputeUploadJobStatus(doc.channels);
    doc.markModified('channels');
    await doc.save();

    this.emitUploadEvent(doc.uploadId, 'upload:updated', {
      uploadId: doc.uploadId,
      caption: hasCaptionUpdate ? content : undefined,
      scheduledAt: scheduledIso,
      youtubeTitle: hasTitleUpdate ? title : undefined,
      channels: scheduledChannels.map((ch) =>
        this.toChannelDto(ch, doc.resolvedOutputs),
      ),
      summary: buildUploadStatusSummary(doc.channels),
    });

    return { success: true };
  }

  async publishUpload(
    uploadId: string,
    body: PublishUploadDto,
    auth: TenancyAuth,
  ): Promise<PublishUploadResult> {
    let doc = await this.uploadModel.findOne({ uploadId }).exec();
    if (!doc) {
      throw new NotFoundException(`Upload ${uploadId} not found`);
    }
    this.assertUploadAccess(doc, auth, uploadId);
    await this.migrateLegacyChannelsFromMongo(doc);
    await this.contentService.autoApproveIfDraftForPublish(
      doc.contentRef,
      auth,
    );

    const reloaded = await this.uploadModel.findOne({ uploadId }).exec();
    if (!reloaded) {
      throw new NotFoundException(`Upload ${uploadId} not found`);
    }
    this.assertUploadAccess(reloaded, auth, uploadId);
    await this.migrateLegacyChannelsFromMongo(reloaded);
    doc = reloaded;
    await this.ensureChannelsForConnectedAccounts(doc, auth.userId);

    const roFallback = doc.resolvedOutputs ?? {};
    for (const ch of doc.channels) {
      this.coerceLegacyChannelRow(ch, roFallback);
    }

    if (!body.channels?.length) {
      throw new BadRequestException('channels array is required');
    }

    if (!body.publishNow) {
      const s = body.scheduledAt?.trim();
      if (!s) {
        throw new BadRequestException(
          'scheduledAt is required when publishNow is false',
        );
      }
      const scheduledDate = new Date(s);
      if (Number.isNaN(scheduledDate.getTime())) {
        throw new BadRequestException('Invalid scheduledAt datetime.');
      }
      if (scheduledDate.getTime() <= Date.now()) {
        throw new BadRequestException('Scheduled time must be in the future.');
      }
    }

    const dtoByChannel = new Map<string, ChannelPublishDto>();
    for (const row of body.channels) {
      dtoByChannel.set(row.channel.trim().toLowerCase(), row);
    }

    const connected = await this.mcpService.getConnectedAccounts(auth.userId);
    const accountByChannel = new Map(
      connected.accounts.map((a) => [a.channel.toLowerCase(), a.accountId]),
    );

    type Work = {
      row: UploadChannelEntry;
      caption: string;
      mediaUrl: string | null;
      youtubeTitle: string | null;
    };
    const workList: Work[] = [];

    for (const row of doc.channels) {
      const key = row.channel.toLowerCase();
      const entry = dtoByChannel.get(key);
      const include = entry ? Boolean(entry.included) : Boolean(row.included);
      if (!include) continue;

      const accountId = accountByChannel.get(key)?.trim();
      if (!accountId) {
        throw new BadRequestException(
          `${row.channel} is not connected. Please connect in Settings first.`,
        );
      }

      const caption = this.rowCaption(row, roFallback);
      if (!caption.trim()) {
        throw new BadRequestException(
          `No caption available for ${row.channel}.`,
        );
      }

      const mediaUrl = this.rowPrimaryMedia(row);
      const youtubeTitle = key === 'youtube' ? this.rowYoutubeTitle(row) : null;

      workList.push({ row, caption, mediaUrl, youtubeTitle });
    }

    if (workList.length === 0) {
      throw new BadRequestException('No channels selected.');
    }

    for (const w of workList) {
      w.row.status = UploadChannelStatus.Publishing;
      w.row.failureReason = null;
      w.row.zernioPostId = null;
      if (body.publishNow) {
        w.row.scheduledAt = null;
      }
      w.row.publishedAt = null;
      this.emitUploadEvent(doc.uploadId, 'upload:started', {
        uploadId: doc.uploadId,
        channel: w.row.channel.toLowerCase(),
      });
    }

    doc.status = recomputeUploadJobStatus(doc.channels);
    await doc.save();

    const scheduledIso = body.publishNow ? null : body.scheduledAt!.trim();

    try {
      const { postId } = await this.mcpService.publishCreatePostBatch(
        auth.userId,
        {
          platforms: workList.map((w) => ({
            platform: w.row.channel.toLowerCase(),
            accountId: accountByChannel.get(w.row.channel.toLowerCase())!,
            content: w.caption,
            mediaUrl: w.mediaUrl,
            title: w.youtubeTitle,
          })),
          publishNow: body.publishNow,
          scheduledAt: scheduledIso,
        },
      );

      const scheduledDate = body.publishNow ? null : new Date(scheduledIso!);
      const now = new Date();

      for (const w of workList) {
        if (body.publishNow) {
          w.row.status = UploadChannelStatus.Published;
          w.row.publishedAt = now;
          w.row.scheduledAt = null;
        } else {
          w.row.status = UploadChannelStatus.Scheduled;
          w.row.scheduledAt = scheduledDate;
          w.row.publishedAt = null;
        }
        w.row.zernioPostId = postId || null;
        w.row.failureReason = null;
        const chKey = w.row.channel.toLowerCase();
        if (body.publishNow) {
          this.emitUploadEvent(doc.uploadId, 'upload:completed', {
            uploadId: doc.uploadId,
            channel: chKey,
            postId: postId || null,
          });
        } else {
          this.emitUploadEvent(doc.uploadId, 'upload:scheduled', {
            uploadId: doc.uploadId,
            channel: chKey,
            scheduledAt: scheduledDate!.toISOString(),
            postId: postId || null,
          });
        }
      }
    } catch (err: unknown) {
      const msg = getFriendlyZernioPublishError(err);
      for (const w of workList) {
        w.row.status = UploadChannelStatus.Failed;
        w.row.failureReason = msg;
        w.row.retryCount = (w.row.retryCount ?? 0) + 1;
        this.emitUploadEvent(doc.uploadId, 'upload:failed', {
          uploadId: doc.uploadId,
          channel: w.row.channel.toLowerCase(),
          message: msg,
        });
      }
    }

    doc.status = recomputeUploadJobStatus(doc.channels);
    await doc.save();

    const channelsPublished = workList.map((w) => w.row.channel.toLowerCase());
    this.emitUploadEvent(doc.uploadId, 'upload:all_completed', {
      uploadId: doc.uploadId,
      publishNow: body.publishNow,
      scheduledAt: scheduledIso,
      channelsPublished,
      summary: buildUploadStatusSummary(doc.channels),
    });

    return { success: true };
  }

  async retryUpload(
    uploadId: string,
    auth: TenancyAuth,
  ): Promise<PublishUploadResult> {
    const doc = await this.uploadModel.findOne({ uploadId }).exec();
    if (!doc) throw new NotFoundException(`Upload ${uploadId} not found`);
    this.assertUploadAccess(doc, auth, uploadId);
    await this.migrateLegacyChannelsFromMongo(doc);
    await this.ensureChannelsForConnectedAccounts(doc, auth.userId);

    const failed = doc.channels.filter(
      (c) => c.status === UploadChannelStatus.Failed,
    );
    if (failed.length === 0) {
      throw new BadRequestException('No failed channels to retry.');
    }

    const channels: ChannelPublishDto[] = doc.channels.map((c) => {
      const retry = c.status === UploadChannelStatus.Failed;
      if (!retry) {
        return { channel: c.channel, included: false };
      }
      return {
        channel: c.channel,
        included: true,
      };
    });

    return this.publishUpload(
      uploadId,
      {
        publishNow: true,
        scheduledAt: null,
        channels,
      },
      auth,
    );
  }

  private rowCaption(
    row: UploadChannelEntry,
    ro: ResolvedContentOutputs,
  ): string {
    const t = (row.caption ?? '').trim();
    if (t) return t;
    return this.fallbackPrimaryCaption(ro);
  }

  private rowPrimaryMedia(row: UploadChannelEntry): string | null {
    const urls =
      (row.mediaUrls ?? []).map((u) => u.trim()).filter((u) => u.length > 0) ??
      [];
    if (urls.length > 0) {
      return urls[0]!;
    }
    const u = (row.mediaUrl ?? '').trim();
    return u.length > 0 ? u : null;
  }

  private rowYoutubeTitle(row: UploadChannelEntry): string | null {
    const t = (row.youtubeTitle ?? '').trim();
    return t.length > 0 ? t : null;
  }

  private assertUploadAccess(
    doc: UploadDocument,
    auth: TenancyAuth,
    uploadId: string,
  ): void {
    if (auth.role === UserRole.ADMIN) {
      return;
    }
    if (!doc.userId || doc.userId !== auth.userId) {
      throw new NotFoundException(`Upload ${uploadId} not found`);
    }
  }

  private toDetailDto(doc: UploadDocument): UploadDetailDto {
    return {
      uploadId: doc.uploadId,
      contentRef: doc.contentRef,
      status: doc.status,
      channels: doc.channels.map((c) =>
        this.toChannelDto(c, doc.resolvedOutputs),
      ),
      resolvedOutputs: {
        text: doc.resolvedOutputs?.text,
        image: doc.resolvedOutputs?.image,
        translatedText: doc.resolvedOutputs?.translatedText,
        video: doc.resolvedOutputs?.video,
        transcription: doc.resolvedOutputs?.transcription,
        summary: doc.resolvedOutputs?.summary,
      },
    };
  }

  private toChannelDto(
    c: UploadChannelEntry,
    ro?: ResolvedContentOutputs,
  ): UploadChannelDto {
    const outs = ro ?? {};
    let caption = (c.caption ?? '').trim();
    if (!caption) {
      caption = this.fallbackPrimaryCaption(outs);
    }

    let mediaUrl = (c.mediaUrl ?? '').trim() || null;
    const mediaUrls = [...(c.mediaUrls ?? [])]
      .map((u) => u.trim())
      .filter(Boolean);
    if (!mediaUrl && !mediaUrls.length) {
      mediaUrl = (outs.image?.trim() || outs.video?.trim() || null) as
        | string
        | null;
    }

    return {
      channel: c.channel,
      included: c.included ?? true,
      status: c.status,
      caption,
      mediaUrl,
      mediaUrls,
      youtubeTitle: c.youtubeTitle ?? null,
      scheduledAt: c.scheduledAt ? c.scheduledAt.toISOString() : null,
      publishedAt: c.publishedAt ? c.publishedAt.toISOString() : null,
      zernioPostId: c.zernioPostId ?? null,
      failureReason: c.failureReason,
    };
  }

  private coerceLegacyChannelRow(
    row: UploadChannelEntry,
    ro?: ResolvedContentOutputs,
  ): void {
    const legacy = row as unknown as Record<string, unknown>;
    if (!row.zernioPostId && typeof legacy.postId === 'string') {
      row.zernioPostId = legacy.postId;
    }
    const outs = ro ?? {};
    if (!(row.caption ?? '').trim()) {
      row.caption = this.fallbackPrimaryCaption(outs);
    }
    const hasMedia =
      (row.mediaUrl ?? '').trim().length > 0 ||
      (row.mediaUrls?.some((u) => u?.trim()) ?? false);
    if (!hasMedia) {
      row.mediaUrl = (outs.image?.trim() || outs.video?.trim() || null) as
        | string
        | null;
    }
    if (!Array.isArray(row.mediaUrls)) {
      row.mediaUrls = [];
    }
    if (row.mediaUrl === undefined || row.mediaUrl === '') {
      row.mediaUrl = null;
    }
    if (row.youtubeTitle === undefined) {
      row.youtubeTitle = null;
    }
  }

  private fallbackPrimaryCaption(r: ResolvedContentOutputs): string {
    for (const s of [r.text, r.translatedText, r.summary]) {
      const t = s?.trim();
      if (t) return t;
    }
    return '';
  }

  private emitUploadEvent(
    uploadId: string,
    event: string,
    payload: Record<string, unknown>,
  ): void {
    this.events.emitToRoom(`upload_${uploadId}`, event, payload);
  }

  private buildSummaryFromDto(
    channels: UploadChannelDto[],
  ): UploadStatusSummaryDto {
    const summary: UploadStatusSummaryDto = {
      total: channels.length,
      publishing: 0,
      scheduled: 0,
      published: 0,
      failed: 0,
      skipped: 0,
    };
    for (const c of channels) {
      if (c.status === UploadChannelStatus.Publishing) summary.publishing += 1;
      else if (c.status === UploadChannelStatus.Scheduled)
        summary.scheduled += 1;
      else if (c.status === UploadChannelStatus.Published)
        summary.published += 1;
      else if (c.status === UploadChannelStatus.Failed) summary.failed += 1;
      else if (c.status === UploadChannelStatus.Skipped) summary.skipped += 1;
    }
    return summary;
  }

  private normalizeFailureReason(err: unknown): string {
    const msg =
      err instanceof Error
        ? err.message
        : typeof err === 'string'
          ? err
          : 'Publish failed';
    return msg.length > FAILURE_REASON_MAX
      ? `${msg.slice(0, FAILURE_REASON_MAX)}…`
      : msg;
  }
}
