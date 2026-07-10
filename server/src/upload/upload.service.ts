import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { TenancyAuth } from '../auth/tenancy.types';
import { UserRole } from '../users/schemas/user.schema';
import type { ResolvedContentOutputs } from '../content/content-output.utils';
import { ContentService } from '../content/content.service';
import { EventsService } from '../events/events.service';
import { PostService } from '../post/post.service';
import { McpService } from '../mcp/mcp.service';
import { getFriendlyZernioPublishError } from '../mcp/zernio/zernio-mcp-publish.util';
import {
  isTikTokPhotoMedia,
  tiktokPhotoCaptionError,
} from '../mcp/zernio/tiktok-publish.util';
import { RedNoteService } from '../rednote/rednote.service';
import { REDNOTE_CHANNEL } from '../domain/users/rednote-metadata.types';
import { isRedNoteSessionInvalidError } from '../rednote/errors/rednote.errors';
import type { PublishResult } from '../social/social-publish.types';
import { partitionPublishWorkByChannel } from './upload-provider-partition.util';
import { randomUUID } from 'crypto';
import type { ChannelEntry } from '../rule/schemas/rule.schema';
import type { IUploadRepository } from '../repositories/interfaces/upload.repository.interface';
import type { UploadRecord } from '../repositories/interfaces/upload.repository.interface';
import { UPLOAD_REPOSITORY } from '../repositories/tokens';
import type {
  ChannelPublishDto,
  PublishUploadDto,
} from './dto/publish-upload.dto';
import { isDeprecatedChannelId } from '../workflow/distribution-channels.util';
import type { PatchUploadChannelBodyDto } from './dto/patch-upload-channel.dto';
import type { UpdateUploadDto } from './dto/update-upload.dto';
import type {
  UploadStatusDto,
  UploadStatusSummaryDto,
} from './dto/upload-status.dto';
import {
  UploadChannelStatus,
  UploadJobStatus,
  type UploadChannelEntry,
} from './schemas/upload.schema';
import type { PipelineDocument } from '../pipeline/schemas/pipeline.schema';
import { WorkflowNodeType } from '../nodes/schemas/workflow-node.schema';
import { PipelineNodeExecutionStatus } from '../pipeline/schemas/pipeline.schema';
import { parsePipelineNodeOutputString } from '../pipeline/pipeline-output-parse';
import { normalizeLaneId } from '../workflow/workflow-graph.util';
import { normalizedRuleChannelMapping } from '../rule/rule-mapping.util';
import {
  resolveAutomappedCaption,
  resolveAutomappedMediaUrl,
} from './upload-channel-publish.util';
import { laneMediaFromPipelineNodes } from './upload-lane-media.util';
import {
  buildUploadStatusSummary,
  recomputeUploadJobStatus,
} from './upload-status.util';
import {
  uploadChannels,
  withUploadChannels,
  channelsToJson,
} from './upload-record.util';

export type CreateUploadParams = {
  userId: string;
  contentRef: string;
  workflowRef: string;
  ruleRef: string;
  resolvedOutputs: ResolvedContentOutputs;
  ruleChannels: ChannelEntry[];
  /** When set, used instead of buildChannelEntriesFromRule. */
  channels?: UploadChannelEntry[];
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

@Injectable()
export class UploadService {
  constructor(
    @Inject(UPLOAD_REPOSITORY)
    private readonly uploads: IUploadRepository,
    private readonly mcpService: McpService,
    private readonly redNoteService: RedNoteService,
    private readonly events: EventsService,
    private readonly postService: PostService,
    @Inject(forwardRef(() => ContentService))
    private readonly contentService: ContentService,
  ) {}

  buildChannelEntriesFromPipeline(
    ruleChannels: ChannelEntry[],
    pipeline: PipelineDocument,
    resolvedOutputs: ResolvedContentOutputs,
  ): UploadChannelEntry[] {
    const lanes = pipeline.graph?.lanes ?? [];
    if (lanes.length === 0) {
      return this.buildChannelEntriesFromRule(ruleChannels, resolvedOutputs);
    }

    return ruleChannels.map((ruleCh) => {
      const lane = normalizeLaneId(ruleCh.channel);
      const adaptNode = (pipeline.nodes ?? []).find(
        (n) =>
          n.lane === lane &&
          n.type === WorkflowNodeType.Adapt &&
          (n.status === PipelineNodeExecutionStatus.Completed ||
            n.status === PipelineNodeExecutionStatus.Skipped),
      );
      const adaptOut = adaptNode
        ? parsePipelineNodeOutputString(adaptNode.output)
        : null;
      const map = normalizedRuleChannelMapping(ruleCh);
      const laneMedia = laneMediaFromPipelineNodes(
        pipeline.nodes ?? [],
        lane,
      );
      const laneResolved: ResolvedContentOutputs = {
        ...resolvedOutputs,
        text:
          (typeof adaptOut?.text === 'string' ? adaptOut.text : undefined) ??
          resolvedOutputs.text,
        translatedText:
          (typeof adaptOut?.translatedText === 'string'
            ? adaptOut.translatedText
            : undefined) ?? resolvedOutputs.translatedText,
        summary:
          (typeof adaptOut?.summary === 'string' ? adaptOut.summary : undefined) ??
          resolvedOutputs.summary,
        image: laneMedia.image ?? resolvedOutputs.image,
        video: laneMedia.video ?? resolvedOutputs.video,
      };
      const caption = resolveAutomappedCaption(map.caption, laneResolved);
      const mediaUrl = resolveAutomappedMediaUrl(map.media, laneResolved);
      const skipped = adaptNode?.status === PipelineNodeExecutionStatus.Skipped;
      return {
        channel: ruleCh.channel,
        included: !skipped,
        caption,
        mediaUrl,
        mediaUrls: [],
        youtubeTitle: null,
        status: UploadChannelStatus.Pending,
        scheduledAt: null,
        publishedAt: null,
        retryCount: 0,
        failureReason: skipped ? 'Lane was skipped during generation' : null,
        variantId: adaptNode?.variantId ?? null,
      };
    });
  }

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
    const channelKey = channel.trim().toLowerCase();
    const fallbackMedia = (
      channelKey === 'rednote' || channelKey === 'youtube'
        ? ro.video?.trim() || ro.image?.trim()
        : ro.image?.trim() || ro.video?.trim()
    ) as string | null;
    return {
      channel,
      included: true,
      caption: fallbackCaption,
      mediaUrl: fallbackMedia,
      mediaUrls: [],
      youtubeTitle: null,
      status: UploadChannelStatus.Pending,
      scheduledAt: null,
      publishedAt: null,
      retryCount: 0,
      failureReason: null,
    };
  }

  private async ensureChannelsForConnectedAccounts(
    upload: UploadRecord,
    userId: string,
  ): Promise<UploadRecord> {
    const connected = await this.mcpService.getConnectedAccounts(userId);
    const connectedKeys = new Set(
      (connected.accounts ?? [])
        .map((a) => a.channel?.trim().toLowerCase())
        .filter((key): key is string => Boolean(key) && !isDeprecatedChannelId(key)),
    );
    if (connectedKeys.size === 0) return upload;

    let channels = uploadChannels(upload);
    const existingKeys = new Set(
      channels.map((c) => c.channel.toLowerCase()),
    );
    let changed = false;
    const ro = (upload.resolvedOutputs ?? {}) as ResolvedContentOutputs;

    for (const key of connectedKeys) {
      if (existingKeys.has(key)) continue;
      const channelName = key[0] ? `${key[0].toUpperCase()}${key.slice(1)}` : key;
      channels = [...channels, this.createDefaultChannelRow(channelName, ro)];
      changed = true;
    }

    if (!changed) return upload;

    return this.uploads.save({
      ...withUploadChannels(upload, channels),
      status: recomputeUploadJobStatus(channels),
    });
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
    const channels =
      params.channels ??
      this.buildChannelEntriesFromRule(
        params.ruleChannels,
        params.resolvedOutputs ?? {},
      );

    const doc = await this.uploads.create({
      userId: params.userId,
      contentRef: params.contentRef,
      workflowRef: params.workflowRef,
      ruleRef: params.ruleRef,
      channels: channelsToJson(channels),
      status: UploadJobStatus.Pending,
      resolvedOutputs: (params.resolvedOutputs ?? {}) as unknown as Prisma.InputJsonValue,
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
    const doc = await this.uploads.findLatestByContentRef(
      params.contentRef,
      auth,
    );
    const channels =
      params.channels ??
      this.buildChannelEntriesFromRule(
        params.ruleChannels,
        params.resolvedOutputs ?? {},
      );
    if (doc) {
      const merged = this.mergeChannelsPreservingUserEdits(
        channels,
        uploadChannels(doc),
      );
      let saved = await this.uploads.save({
        ...withUploadChannels(doc, merged),
        resolvedOutputs: (params.resolvedOutputs ?? {}) as unknown as UploadRecord['resolvedOutputs'],
        workflowRef: params.workflowRef,
        ruleRef: params.ruleRef,
        status: recomputeUploadJobStatus(merged),
      });
      saved = await this.ensureChannelsForConnectedAccounts(saved, auth.userId);
      return { uploadId: saved.uploadId };
    }
    return this.createUpload(params);
  }

  /** Keeps upload palette in sync while content is edited (draft); does not rebuild channels. */
  async syncResolvedOutputsForContent(
    contentRef: string,
    auth: TenancyAuth,
    resolvedOutputs: ResolvedContentOutputs,
  ): Promise<void> {
    const doc = await this.uploads.findLatestByContentRef(contentRef, auth);
    if (!doc) {
      return;
    }
    await this.uploads.save({
      ...doc,
      resolvedOutputs: resolvedOutputs as unknown as UploadRecord['resolvedOutputs'],
    });
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
    const docs = await this.uploads.findByContentRefs(contentRefs, auth);
    const sorted = [...docs].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
    for (const d of sorted) {
      const ref = d.contentRef;
      const id = d.uploadId;
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
    const doc = await this.uploads.findLatestByContentRef(contentRef, auth);
    if (!doc) {
      throw new NotFoundException(`No upload found for content ${contentRef}`);
    }
    return { uploadId: doc.uploadId };
  }

  async findByUploadId(
    uploadId: string,
    auth: TenancyAuth,
  ): Promise<UploadDetailDto> {
    let doc = await this.uploads.findByUploadIdScoped(uploadId, auth);
    if (!doc) {
      throw new NotFoundException(`Upload ${uploadId} not found`);
    }
    this.assertUploadAccess(doc, auth, uploadId);
    await this.migrateLegacyChannelsFromMongo(doc);
    doc = await this.ensureChannelsForConnectedAccounts(doc, auth.userId);
    const roFallback = (doc.resolvedOutputs ?? {}) as ResolvedContentOutputs;
    const channels = uploadChannels(doc);
    for (const ch of channels) {
      this.coerceLegacyChannelRow(ch, roFallback);
    }
    return this.toDetailDto(withUploadChannels(doc, channels));
  }

  async getUploadStatus(
    uploadId: string,
    auth: TenancyAuth,
  ): Promise<UploadStatusDto> {
    const detail = await this.findByUploadId(uploadId, auth);
    return {
      uploadId: detail.uploadId,
      status: detail.status,
      channels: detail.channels,
      summary: this.buildSummaryFromDto(detail.channels),
    };
  }

  private async migrateLegacyChannelsFromMongo(
    _doc: UploadRecord,
  ): Promise<void> {
    return;
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

    let doc = await this.uploads.findByUploadIdScoped(uploadId, auth);
    if (!doc) {
      throw new NotFoundException(`Upload ${uploadId} not found`);
    }
    this.assertUploadAccess(doc, auth, uploadId);
    await this.migrateLegacyChannelsFromMongo(doc);
    doc = await this.ensureChannelsForConnectedAccounts(doc, auth.userId);

    const roFallback = (doc.resolvedOutputs ?? {}) as ResolvedContentOutputs;
    let channels = uploadChannels(doc);
    for (const ch of channels) {
      this.coerceLegacyChannelRow(ch, roFallback);
    }

    const row = channels.find((c) => c.channel.toLowerCase() === key);
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

    await this.uploads.save({
      ...withUploadChannels(doc, channels),
      status: recomputeUploadJobStatus(channels),
    });
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
    const hasMediaUpdate =
      body.mediaUrl !== undefined || body.mediaUrls !== undefined;

    if (
      !hasCaptionUpdate &&
      !hasScheduleUpdate &&
      !hasTitleUpdate &&
      !hasMediaUpdate
    ) {
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

    let doc = await this.uploads.findByUploadIdScoped(uploadId, auth);
    if (!doc) {
      throw new NotFoundException(`Upload ${uploadId} not found`);
    }
    this.assertUploadAccess(doc, auth, uploadId);
    await this.migrateLegacyChannelsFromMongo(doc);

    const roFallback = (doc.resolvedOutputs ?? {}) as ResolvedContentOutputs;
    let channels = uploadChannels(doc);
    for (const ch of channels) {
      this.coerceLegacyChannelRow(ch, roFallback);
    }

    const channelFilter = body.channel?.trim().toLowerCase() ?? null;

    const scheduledPosts = await this.postService.findScheduledPostsForUpload(
      doc.uploadId,
    );

    let scheduledChannels = channels.filter(
      (ch) => ch.status === UploadChannelStatus.Scheduled,
    );
    if (channelFilter) {
      scheduledChannels = scheduledChannels.filter(
        (ch) => ch.channel.toLowerCase() === channelFilter,
      );
    }
    if (scheduledPosts.length === 0 || scheduledChannels.length === 0) {
      throw new BadRequestException(
        channelFilter
          ? `No scheduled post found for ${body.channel}.`
          : 'No scheduled post found. Only scheduled posts can be updated.',
      );
    }

    if (channelFilter) {
      const targetChannel = scheduledChannels[0]!;
      if (
        hasTitleUpdate &&
        targetChannel.channel.toLowerCase() !== 'youtube'
      ) {
        throw new BadRequestException(
          'YouTube title can only be updated for a scheduled YouTube channel.',
        );
      }
    } else {
      const scheduledYoutubeChannels = scheduledChannels.filter(
        (ch) => ch.channel.toLowerCase() === 'youtube',
      );
      if (hasTitleUpdate && scheduledYoutubeChannels.length === 0) {
        throw new BadRequestException(
          'No scheduled YouTube post found to update.',
        );
      }
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

    if (hasMediaUpdate) {
      for (const ch of scheduledChannels) {
        if (body.mediaUrls !== undefined) {
          ch.mediaUrls = [...(body.mediaUrls ?? [])];
          ch.mediaUrl = ch.mediaUrls[0] ?? null;
        } else if (body.mediaUrl !== undefined) {
          ch.mediaUrl = body.mediaUrl;
          ch.mediaUrls = body.mediaUrl ? [body.mediaUrl] : [];
        }
      }
    }

    for (const ch of scheduledChannels) {
      const caption = hasCaptionUpdate
        ? (content ?? '')
        : this.rowCaption(ch, roFallback);
      const mediaUrls = this.resolveRowMediaForPublish(ch, roFallback);
      if (hasCaptionUpdate || hasMediaUpdate) {
        this.assertTikTokPhotoCaption(ch.channel, caption, mediaUrls);
      }
      if (hasMediaUpdate) {
        this.assertChannelMediaForPublish(ch.channel, mediaUrls);
      }
    }

    const matchingPosts = channelFilter
      ? scheduledPosts.filter((p) =>
          (p.channels ?? []).some(
            (c) => String(c).trim().toLowerCase() === channelFilter,
          ),
        )
      : scheduledPosts;

    const postIds = [
      ...new Set(
        matchingPosts
          .map((p) => p.zernioPostId?.trim())
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (postIds.length === 0) {
      throw new BadRequestException(
        'No Zernio post id on scheduled records for this upload.',
      );
    }

    for (const post of matchingPosts) {
      const postId = post.zernioPostId?.trim();
      if (!postId) continue;

      const postChannelKeys = (post.channels ?? []).map((c) =>
        String(c).trim().toLowerCase(),
      );
      const postChannels =
        postChannelKeys.length > 0
          ? scheduledChannels.filter((ch) =>
              postChannelKeys.includes(ch.channel.toLowerCase()),
            )
          : scheduledChannels;
      const primaryChannel = postChannels[0];

      let mediaUrlsForPost: string[] | undefined;
      if (hasMediaUpdate && primaryChannel) {
        mediaUrlsForPost = this.resolveRowMediaForPublish(
          primaryChannel,
          roFallback,
        );
      }

      const titleForPost =
        hasTitleUpdate &&
        postChannels.some((ch) => ch.channel.toLowerCase() === 'youtube')
          ? title
          : undefined;

      await this.mcpService.updatePost({
        postId,
        content,
        scheduledFor: scheduledIso,
        title: titleForPost,
        ...(hasMediaUpdate ? { mediaUrls: mediaUrlsForPost ?? [] } : {}),
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

    if (channelFilter) {
      await this.postService.updateScheduledPostForChannel(
        doc.uploadId,
        channelFilter,
        {
          ...(scheduledDate ? { scheduledAt: scheduledDate } : {}),
          ...(hasCaptionUpdate ? { caption: content } : {}),
        },
      );
    } else if (scheduledDate) {
      await this.postService.updateScheduledPostsOnUpload(doc.uploadId, {
        scheduledAt: scheduledDate,
      });
    }

    doc = await this.uploads.save({
      ...withUploadChannels(doc, channels),
      status: recomputeUploadJobStatus(channels),
    });

    this.emitUploadEvent(doc.uploadId, 'upload:updated', {
      uploadId: doc.uploadId,
      caption: hasCaptionUpdate ? content : undefined,
      scheduledAt: scheduledIso,
      youtubeTitle: hasTitleUpdate ? title : undefined,
      channels: scheduledChannels.map((ch) =>
        this.toChannelDto(ch, roFallback),
      ),
      summary: buildUploadStatusSummary(channels),
    });

    return { success: true };
  }

  async publishUpload(
    uploadId: string,
    body: PublishUploadDto,
    auth: TenancyAuth,
  ): Promise<PublishUploadResult> {
    let doc = await this.uploads.findByUploadIdScoped(uploadId, auth);
    if (!doc) {
      throw new NotFoundException(`Upload ${uploadId} not found`);
    }
    this.assertUploadAccess(doc, auth, uploadId);
    await this.migrateLegacyChannelsFromMongo(doc);
    await this.contentService.autoApproveIfDraftForPublish(
      doc.contentRef,
      auth,
    );

    const reloaded = await this.uploads.findByUploadIdScoped(uploadId, auth);
    if (!reloaded) {
      throw new NotFoundException(`Upload ${uploadId} not found`);
    }
    this.assertUploadAccess(reloaded, auth, uploadId);
    await this.migrateLegacyChannelsFromMongo(reloaded);
    doc = await this.ensureChannelsForConnectedAccounts(reloaded, auth.userId);

    const roFallback = (doc.resolvedOutputs ?? {}) as ResolvedContentOutputs;
    let channels = uploadChannels(doc);
    for (const ch of channels) {
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
      mediaUrls: string[];
      youtubeTitle: string | null;
    };
    const workList: Work[] = [];

    const nonPublishableStatuses = new Set<UploadChannelStatus>([
      UploadChannelStatus.Published,
      UploadChannelStatus.Scheduled,
      UploadChannelStatus.Publishing,
    ]);

    for (const row of channels) {
      const key = row.channel.toLowerCase();
      const entry = dtoByChannel.get(key);
      const include = entry ? Boolean(entry.included) : Boolean(row.included);
      if (!include) continue;
      if (nonPublishableStatuses.has(row.status)) continue;

      const accountId = accountByChannel.get(key)?.trim();
      if (key === REDNOTE_CHANNEL) {
        const rnStatus = await this.redNoteService.getAccountStatus(auth.userId);
        if (!rnStatus.connected) {
          throw new BadRequestException(
            'RedNote is not connected. Please connect in Settings first.',
          );
        }
      } else if (!accountId) {
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

      const mediaUrls = this.resolveRowMediaForPublish(row, roFallback);
      this.assertChannelMediaForPublish(row.channel, mediaUrls);
      this.assertTikTokPhotoCaption(row.channel, caption, mediaUrls);
      const mediaUrl = mediaUrls[0] ?? null;
      const youtubeTitle = key === 'youtube' ? this.rowYoutubeTitle(row) : null;

      workList.push({ row, caption, mediaUrl, mediaUrls, youtubeTitle });
    }

    if (workList.length === 0) {
      throw new BadRequestException('No channels selected.');
    }

    const scheduledIso = body.publishNow ? null : body.scheduledAt!.trim();
    const scheduledDate = body.publishNow ? null : new Date(scheduledIso!);
    const now = new Date();

    const publisherUserId = doc.userId ?? auth.userId;
    if (!publisherUserId?.trim()) {
      throw new BadRequestException('Upload is missing userId for post record.');
    }

    const channelsSucceeded: string[] = [];

    for (const w of workList) {
      const chKey = w.row.channel.toLowerCase();
      w.row.status = UploadChannelStatus.Publishing;
      w.row.failureReason = null;
      if (body.publishNow) {
        w.row.scheduledAt = null;
      }
      w.row.publishedAt = null;
      this.emitUploadEvent(doc.uploadId, 'upload:started', {
        uploadId: doc.uploadId,
        channel: chKey,
      });
    }
    doc = await this.uploads.save({
      ...withUploadChannels(doc, channels),
      status: recomputeUploadJobStatus(channels),
    });

    const publishUploadId = doc.uploadId;
    const publishRuleRef = doc.ruleRef;
    const publishContentRef = doc.contentRef;

    const { zernioWork, rednoteWork } =
      partitionPublishWorkByChannel(workList);

    let zernioPostId: string | null = null;

    const zernioTask = async (): Promise<void> => {
      if (zernioWork.length === 0) return;
      try {
        const { postId } = await this.mcpService.publishCreatePostBatch(
          auth.userId,
          {
            platforms: zernioWork.map((w) => {
              const chKey = w.row.channel.toLowerCase();
              return {
                platform: chKey,
                accountId: accountByChannel.get(chKey)!,
                content: w.caption,
                mediaUrl: w.mediaUrl,
                mediaUrls: w.mediaUrls.length ? w.mediaUrls : null,
                title: w.youtubeTitle,
              };
            }),
            publishNow: body.publishNow,
            scheduledAt: scheduledIso,
          },
        );
        zernioPostId = postId;

        await this.postService.createPostFromSuccessfulPublish({
          userId: publisherUserId,
          uploadRef: publishUploadId,
          ruleRef: publishRuleRef,
          contentRef: publishContentRef,
          zernioPostId: postId,
          channels: zernioWork.map((w) => w.row.channel.toLowerCase()),
          publishNow: body.publishNow,
          scheduledAt: scheduledDate,
        });

        for (const w of zernioWork) {
          const chKey = w.row.channel.toLowerCase();
          if (body.publishNow) {
            w.row.status = UploadChannelStatus.Published;
            w.row.publishedAt = now;
            w.row.scheduledAt = null;
          } else {
            w.row.status = UploadChannelStatus.Scheduled;
            w.row.scheduledAt = scheduledDate;
            w.row.publishedAt = null;
          }
          w.row.failureReason = null;
          channelsSucceeded.push(chKey);

          if (body.publishNow) {
            this.emitUploadEvent(publishUploadId, 'upload:completed', {
              uploadId: publishUploadId,
              channel: chKey,
              postId: postId || null,
            });
          } else {
            this.emitUploadEvent(publishUploadId, 'upload:scheduled', {
              uploadId: publishUploadId,
              channel: chKey,
              scheduledAt: scheduledDate!.toISOString(),
              postId: postId || null,
            });
          }
        }
      } catch (err: unknown) {
        const msg = getFriendlyZernioPublishError(err);
        for (const w of zernioWork) {
          const chKey = w.row.channel.toLowerCase();
          w.row.status = UploadChannelStatus.Failed;
          w.row.failureReason = msg;
          w.row.retryCount = (w.row.retryCount ?? 0) + 1;
          this.emitUploadEvent(publishUploadId, 'upload:failed', {
            uploadId: publishUploadId,
            channel: chKey,
            message: msg,
          });
        }
      }
    };

    const rednoteTasks = rednoteWork.map(async (w) => {
      const chKey = REDNOTE_CHANNEL;
      if (!body.publishNow) {
        w.row.status = UploadChannelStatus.Failed;
        w.row.failureReason =
          'RedNote scheduled publish is not supported yet. Publish now instead.';
        w.row.retryCount = (w.row.retryCount ?? 0) + 1;
        this.emitUploadEvent(publishUploadId, 'upload:failed', {
          uploadId: publishUploadId,
          channel: chKey,
          message: w.row.failureReason,
        });
        return;
      }

      const localPostId = randomUUID();
      try {
        await this.redNoteService.publishEnqueue({
          userId: auth.userId,
          postId: localPostId,
          uploadId: publishUploadId,
          caption: w.caption,
          mediaUrls: w.mediaUrls,
          scheduledAt: null,
        });
      } catch (err: unknown) {
        if (isRedNoteSessionInvalidError(err)) {
          w.row.failureReason =
            'Publish failed — could not verify RedNote creator session. Retry, or reconnect in Settings if this persists.';
        } else {
          w.row.failureReason =
            err instanceof Error ? err.message : 'RedNote publish failed';
        }
        w.row.status = UploadChannelStatus.Failed;
        w.row.retryCount = (w.row.retryCount ?? 0) + 1;
        this.emitUploadEvent(publishUploadId, 'upload:failed', {
          uploadId: publishUploadId,
          channel: chKey,
          message: w.row.failureReason,
        });
      }
    });

    await Promise.all([zernioTask(), ...rednoteTasks]);
    void zernioPostId;

    doc = await this.uploads.save({
      ...withUploadChannels(doc, channels),
      status: recomputeUploadJobStatus(channels),
    });

    const channelsPublished = channelsSucceeded;
    const rednoteStillPublishing = rednoteWork.some(
      (w) => w.row.status === UploadChannelStatus.Publishing,
    );
    if (!rednoteStillPublishing) {
      this.emitUploadEvent(publishUploadId, 'upload:all_completed', {
        uploadId: publishUploadId,
        publishNow: body.publishNow,
        scheduledAt: scheduledIso,
        channelsPublished,
        summary: buildUploadStatusSummary(channels),
      });
    }

    return { success: true };
  }

  async retryUpload(
    uploadId: string,
    auth: TenancyAuth,
  ): Promise<PublishUploadResult> {
    let doc = await this.uploads.findByUploadIdScoped(uploadId, auth);
    if (!doc) throw new NotFoundException(`Upload ${uploadId} not found`);
    this.assertUploadAccess(doc, auth, uploadId);
    await this.migrateLegacyChannelsFromMongo(doc);
    doc = await this.ensureChannelsForConnectedAccounts(doc, auth.userId);

    const channels = uploadChannels(doc);
    const failed = channels.filter(
      (c) => c.status === UploadChannelStatus.Failed,
    );
    if (failed.length === 0) {
      throw new BadRequestException('No failed channels to retry.');
    }

    const channelDtos: ChannelPublishDto[] = channels.map((c) => {
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
        channels: channelDtos,
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
    return this.rowAllMedia(row)[0] ?? null;
  }

  /** All media URLs for Zernio carousel / multi-image publish (deduped, order preserved). */
  private rowAllMedia(row: UploadChannelEntry): string[] {
    const fromArray = (row.mediaUrls ?? [])
      .map((u) => u.trim())
      .filter((u) => u.length > 0);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const u of fromArray) {
      if (seen.has(u)) continue;
      seen.add(u);
      out.push(u);
    }
    if (out.length > 0) return out;
    const single = (row.mediaUrl ?? '').trim();
    return single.length > 0 ? [single] : [];
  }

  private resolveRowMediaForPublish(
    row: UploadChannelEntry,
    ro: ResolvedContentOutputs,
  ): string[] {
    const key = row.channel.trim().toLowerCase();
    const urls = this.rowAllMedia(row);
    if (key === 'rednote' || key === 'youtube') {
      const videos = urls.filter((u) => this.isVideoMediaUrl(u));
      if (videos.length > 0) return [videos[0]!];
      const fallback = (ro.video?.trim() || '').trim();
      return fallback.length > 0 ? [fallback] : [];
    }
    if (urls.length > 0) return urls;
    const fallback = (ro.image?.trim() || ro.video?.trim() || '').trim();
    return fallback.length > 0 ? [fallback] : [];
  }

  private channelRequiresMedia(channelKey: string): boolean {
    const key = channelKey.trim().toLowerCase();
    return key === 'youtube' || key === 'tiktok' || key === 'rednote';
  }

  private isVideoMediaUrl(url: string): boolean {
    const u = url.trim();
    if (/\.(mp4|webm|mov|m4v|mkv)(\?|$)/i.test(u)) return true;
    if (/\/videos\//i.test(u)) return true;
    return false;
  }

  private isImageMediaUrl(url: string): boolean {
    return /\.(jpe?g|png|webp|gif)(\?|$)/i.test(url.trim());
  }

  private assertChannelMediaForPublish(
    channel: string,
    mediaUrls: string[],
  ): void {
    const key = channel.trim().toLowerCase();
    if (!this.channelRequiresMedia(key)) return;

    if (mediaUrls.length === 0) {
      throw new BadRequestException(
        `${channel} requires media (image or video) before publishing.`,
      );
    }

    if (key === 'youtube' && !mediaUrls.some((u) => this.isVideoMediaUrl(u))) {
      throw new BadRequestException(
        `${channel} requires a video before publishing.`,
      );
    }

    if (key === 'rednote' && !mediaUrls.some((u) => this.isVideoMediaUrl(u))) {
      throw new BadRequestException(
        `${channel} requires a video before publishing.`,
      );
    }
  }

  private assertTikTokPhotoCaption(
    channel: string,
    caption: string,
    mediaUrls: string[],
  ): void {
    const key = channel.trim().toLowerCase();
    if (key !== 'tiktok' || !isTikTokPhotoMedia(mediaUrls)) return;
    const err = tiktokPhotoCaptionError(caption);
    if (err) throw new BadRequestException(err);
  }

  private rowYoutubeTitle(row: UploadChannelEntry): string | null {
    const t = (row.youtubeTitle ?? '').trim();
    return t.length > 0 ? t : null;
  }

  private assertUploadAccess(
    doc: UploadRecord,
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

  private toDetailDto(doc: UploadRecord): UploadDetailDto {
    const channels = uploadChannels(doc);
    const ro = (doc.resolvedOutputs ?? {}) as ResolvedContentOutputs;
    return {
      uploadId: doc.uploadId,
      contentRef: doc.contentRef,
      status: doc.status as UploadJobStatus,
      channels: channels.map((c) => this.toChannelDto(c, ro)),
      resolvedOutputs: {
        text: ro.text,
        image: ro.image,
        translatedText: ro.translatedText,
        video: ro.video,
        transcription: ro.transcription,
        summary: ro.summary,
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
      scheduledAt: this.channelDateIso(c.scheduledAt),
      publishedAt: this.channelDateIso(c.publishedAt),
      failureReason: c.failureReason,
    };
  }

  private channelDateIso(value: unknown): string | null {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(value as string);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }

  private coerceLegacyChannelRow(
    row: UploadChannelEntry,
    ro?: ResolvedContentOutputs,
  ): void {
    const legacy = row as unknown as Record<string, unknown>;
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

  /** Called by RedNote publish worker when a background job finishes. */
  async finalizeRedNotePublishOutcome(input: {
    uploadId: string;
    userId: string;
    localPostId: string;
    result?: PublishResult;
    error?: unknown;
  }): Promise<void> {
    const { uploadId, userId, localPostId, result, error } = input;
    let doc = await this.uploads.findByUploadId(uploadId);
    if (!doc) return;
    if ((doc.userId ?? userId) !== userId) return;

    const channels = uploadChannels(doc);
    const row = channels.find(
      (c) => c.channel.trim().toLowerCase() === REDNOTE_CHANNEL,
    );
    if (!row || row.status !== UploadChannelStatus.Publishing) return;

    const chKey = REDNOTE_CHANNEL;
    const now = new Date();
    const publisherUserId = doc.userId ?? userId;

    if (result?.success && !result.needsManualVerification) {
      await this.postService.createPostFromSuccessfulPublish({
        userId: publisherUserId,
        uploadRef: uploadId,
        ruleRef: doc.ruleRef,
        contentRef: doc.contentRef,
        zernioPostId: result.externalPostRef ?? `rednote:${localPostId}`,
        channels: [chKey],
        publishNow: true,
        scheduledAt: null,
      });

      row.status = UploadChannelStatus.Published;
      row.publishedAt = now;
      row.scheduledAt = null;
      row.failureReason = null;
      this.emitUploadEvent(uploadId, 'upload:completed', {
        uploadId,
        channel: chKey,
        postId: result.externalPostRef ?? localPostId,
        needsManualVerification: false,
      });
    } else {
      if (result?.needsManualVerification) {
        row.failureReason =
          'RedNote publish was not confirmed — success page did not appear.';
      } else if (isRedNoteSessionInvalidError(error)) {
        row.failureReason =
          'Publish failed — could not verify RedNote creator session. Retry, or reconnect in Settings if this persists.';
      } else {
        row.failureReason =
          error instanceof Error ? error.message : 'RedNote publish failed';
      }
      row.status = UploadChannelStatus.Failed;
      row.retryCount = (row.retryCount ?? 0) + 1;
      this.emitUploadEvent(uploadId, 'upload:failed', {
        uploadId,
        channel: chKey,
        message: row.failureReason,
      });
    }

    doc = await this.uploads.save({
      ...withUploadChannels(doc, channels),
      status: recomputeUploadJobStatus(channels),
    });

    const channelsPublished = channels
      .filter((c) => c.status === UploadChannelStatus.Published)
      .map((c) => c.channel.toLowerCase());
    this.emitUploadEvent(uploadId, 'upload:all_completed', {
      uploadId,
      publishNow: true,
      scheduledAt: null,
      channelsPublished,
      summary: buildUploadStatusSummary(channels),
    });
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
