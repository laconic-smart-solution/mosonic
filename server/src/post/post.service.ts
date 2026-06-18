import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { TenancyAuth } from '../auth/tenancy.types';
import { mergeUserIdFilter } from '../auth/tenancy.util';
import type { ResolvedContentOutputs } from '../content/content-output.utils';
import { UserRole } from '../users/schemas/user.schema';
import { getFriendlyZernioPublishError } from '../mcp/zernio/zernio-mcp-publish.util';
import {
  assertTikTokPhotoCaptionForPublish,
  resolvePlatformMediaUrls,
} from '../mcp/zernio/tiktok-publish.util';
import { McpService } from '../mcp/mcp.service';
import {
  Upload,
  UploadChannelStatus,
  type UploadChannelEntry,
  type UploadDocument,
} from '../upload/schemas/upload.schema';
import { recomputeUploadJobStatus } from '../upload/upload-status.util';
import { PostAnalyticsService } from './post-analytics.service';
import { ListPostsQueryDto } from './dto/list-posts-query.dto';
import { PostListSort } from './dto/post-list-sort.enum';
import type { PatchPostDto } from './dto/patch-post.dto';
import {
  Post,
  PlatformPostStatus,
  PostStatus,
  type PostDocument,
  type PlatformResult,
} from './schemas/post.schema';

const PATCHABLE_POST_STATUSES: ReadonlySet<PostStatus> = new Set([
  PostStatus.Pending,
  PostStatus.Scheduled,
  PostStatus.Partial,
]);

const PUBLISHABLE_POST_STATUSES: ReadonlySet<PostStatus> = new Set([
  PostStatus.Pending,
  PostStatus.Scheduled,
  PostStatus.Partial,
  PostStatus.Failed,
]);

type PublishWorkItem = {
  row: UploadChannelEntry;
  accountId: string;
  caption: string;
  mediaUrl: string | null;
  mediaUrls: string[];
  youtubeTitle: string | null;
};

function escapeRegexFragment(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isVideoMediaUrl(url: string): boolean {
  return /\.(mp4|webm|mov|m4v|mkv)(\?|$)/i.test(url.trim());
}

@Injectable()
export class PostService {
  constructor(
    @InjectModel(Post.name)
    private readonly postModel: Model<PostDocument>,
    @InjectModel(Upload.name)
    private readonly uploadModel: Model<UploadDocument>,
    private readonly mcpService: McpService,
    private readonly postAnalyticsService: PostAnalyticsService,
  ) {}

  private async ensurePostAnalyticsRecord(post: PostDocument): Promise<void> {
    await this.postAnalyticsService.ensureForPost(post);
  }

  async createPostFromSuccessfulPublish(params: {
    userId: string;
    uploadRef: string;
    ruleRef: string;
    contentRef: string;
    zernioPostId: string;
    channels: string[];
    publishNow: boolean;
    scheduledAt: Date | null;
  }): Promise<{ postId: string }> {
    const now = new Date();
    const platformResults: PlatformResult[] = params.channels.map((platform) =>
      params.publishNow
        ? {
            platform,
            status: PlatformPostStatus.Published,
            platformUrl: null,
            publishedAt: now,
            failureReason: null,
          }
        : {
            platform,
            status: PlatformPostStatus.Scheduled,
            platformUrl: null,
            publishedAt: null,
            failureReason: null,
          },
    );

    const doc = await this.postModel.create({
      userId: params.userId,
      uploadRef: params.uploadRef,
      ruleRef: params.ruleRef,
      contentRef: params.contentRef,
      zernioPostId: params.zernioPostId,
      channels: [...params.channels],
      status: params.publishNow ? PostStatus.Published : PostStatus.Scheduled,
      scheduledAt: params.publishNow ? null : params.scheduledAt,
      publishedAt: params.publishNow ? now : null,
      publishedNow: params.publishNow,
      platformResults,
      retryCount: 0,
      failureReason: null,
    });

    return { postId: doc.postId };
  }

  findByZernioPostId(zernioPostId: string): Promise<PostDocument | null> {
    return this.postModel
      .findOne({ zernioPostId })
      .exec();
  }

  async getPostStats(auth: TenancyAuth): Promise<{
    total: number;
    byStatus: Partial<Record<PostStatus, number>>;
  }> {
    const scoped = mergeUserIdFilter({}, auth);
    const agg = await this.postModel
      .aggregate<{ _id: PostStatus | null; count: number }>([
        { $match: scoped },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ])
      .exec();

    const byStatus: Partial<Record<PostStatus, number>> = {};
    let total = 0;
    const knownStatuses = new Set<string>(Object.values(PostStatus));
    for (const row of agg) {
      total += row.count;
      if (row._id == null) continue;
      const key =
        typeof row._id === 'string'
          ? row._id
          : typeof row._id === 'object' &&
              row._id !== null &&
              'toString' in row._id
            ? String(row._id)
            : String(row._id);
      if (knownStatuses.has(key)) {
        byStatus[key as PostStatus] = row.count;
      }
    }
    return { total, byStatus };
  }

  async listPosts(
    auth: TenancyAuth,
    query: ListPostsQueryDto,
  ): Promise<{
    posts: unknown[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.ruleRef?.trim()) filter.ruleRef = query.ruleRef.trim();
    if (query.uploadRef?.trim()) filter.uploadRef = query.uploadRef.trim();

    const ch = query.channel?.trim().toLowerCase();
    if (ch) {
      filter.channels = new RegExp(`^${escapeRegexFragment(ch)}$`, 'i');
    }

    const searchTerm = query.search?.trim();
    if (searchTerm) {
      const rx = new RegExp(escapeRegexFragment(searchTerm), 'i');
      filter.$or = [
        { postId: rx },
        { uploadRef: rx },
        { contentRef: rx },
        { ruleRef: rx },
      ];
    }

    if (query.from || query.to) {
      const createdAt: { $gte?: Date; $lte?: Date } = {};
      if (query.from) {
        const d = new Date(query.from);
        if (!Number.isNaN(d.getTime())) createdAt.$gte = d;
      }
      if (query.to) {
        const d = new Date(query.to);
        if (!Number.isNaN(d.getTime())) createdAt.$lte = d;
      }
      if (Object.keys(createdAt).length > 0) filter.createdAt = createdAt;
    }

    const scoped = mergeUserIdFilter(filter, auth);
    const page = query.page;
    const limit = query.limit;
    const sortSpec = this.listPostsSort(query.sort);

    const [postsRaw, total] = await Promise.all([
      this.postModel
        .find(scoped)
        .sort(sortSpec)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.postModel.countDocuments(scoped).exec(),
    ]);

    const posts = postsRaw as unknown as Array<Record<string, unknown>>;
    await this.attachListCaptionPreviews(posts);

    return {
      posts,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  private listPostsSort(sort?: PostListSort): Record<string, 1 | -1> {
    switch (sort) {
      case PostListSort.OldestCreated:
        return { createdAt: 1 };
      case PostListSort.ScheduledDesc:
        return { scheduledAt: -1, createdAt: -1 };
      case PostListSort.ScheduledAsc:
        return { scheduledAt: 1, createdAt: -1 };
      case PostListSort.StatusAsc:
        return { status: 1, createdAt: -1 };
      case PostListSort.NewestCreated:
      default:
        return { createdAt: -1 };
    }
  }

  private async attachListCaptionPreviews(
    posts: Array<Record<string, unknown>>,
  ): Promise<void> {
    const refs = [
      ...new Set(
        posts
          .map((p) => String(p['uploadRef'] ?? '').trim())
          .filter((r) => r.length > 0),
      ),
    ];
    if (refs.length === 0) return;

    const uploads = await this.uploadModel
      .find({ uploadId: { $in: refs } })
      .select('uploadId channels resolvedOutputs')
      .lean()
      .exec();

    const byId = new Map(uploads.map((u) => [String(u.uploadId), u]));

    const CAP_LEN = 160;

    for (const p of posts) {
      const ref = String(p['uploadRef'] ?? '').trim();
      const u = byId.get(ref);
      if (!u) continue;

      const ro = (u.resolvedOutputs ?? {}) as ResolvedContentOutputs;
      const postChannels = (p['channels'] as string[] | undefined) ?? [];

      let caption = '';
      for (const plat of postChannels) {
        const key = plat.trim().toLowerCase();
        const row = u.channels?.find(
          (c) => c.channel.trim().toLowerCase() === key,
        );
        if (!row) continue;
        const c = this.rowCaption(row, ro);
        if (c.trim()) {
          caption = c;
          break;
        }
      }

      let youtubeTitlePreview: string | null = null;
      if (postChannels.some((plat) => plat.trim().toLowerCase() === 'youtube')) {
        const ytRow = u.channels?.find(
          (c) => c.channel.trim().toLowerCase() === 'youtube',
        );
        if (ytRow) youtubeTitlePreview = this.rowYoutubeTitle(ytRow);
      }

      const trimmed = caption.trim();
      p['captionPreview'] =
        trimmed.length > CAP_LEN ? `${trimmed.slice(0, CAP_LEN)}…` : trimmed || null;
      p['youtubeTitlePreview'] = youtubeTitlePreview;

      const mediaPreview = this.resolveListMediaPreview(postChannels, u.channels ?? []);
      if (mediaPreview) {
        p['mediaPreviewUrl'] = mediaPreview.url;
        p['mediaKind'] = mediaPreview.kind;
      }
    }
  }

  private resolveDetailMediaItems(
    postChannels: string[],
    uploadChannels: UploadChannelEntry[],
  ): Array<{ url: string; kind: 'image' | 'video' }> {
    const keys = new Set(
      postChannels.map((c) => c.trim().toLowerCase()).filter(Boolean),
    );
    const seen = new Set<string>();
    const out: Array<{ url: string; kind: 'image' | 'video' }> = [];

    for (const row of uploadChannels) {
      const key = row.channel.trim().toLowerCase();
      if (!keys.has(key)) continue;
      for (const url of this.rowAllMedia(row)) {
        if (seen.has(url)) continue;
        seen.add(url);
        out.push({
          url,
          kind: isVideoMediaUrl(url) ? 'video' : 'image',
        });
      }
    }

    return out;
  }

  private async enrichPostDetail(
    local: Record<string, unknown>,
  ): Promise<void> {
    const ref = String(local['uploadRef'] ?? '').trim();
    if (!ref) return;

    const upload = await this.uploadModel
      .findOne({ uploadId: ref })
      .select('channels resolvedOutputs')
      .lean()
      .exec();
    if (!upload) return;

    const postChannels = (local['channels'] as string[] | undefined) ?? [];
    const ro = (upload.resolvedOutputs ?? {}) as ResolvedContentOutputs;

    let caption = '';
    for (const plat of postChannels) {
      const key = plat.trim().toLowerCase();
      const row = upload.channels?.find(
        (c) => c.channel.trim().toLowerCase() === key,
      );
      if (!row) continue;
      const c = this.rowCaption(row, ro);
      if (c.trim()) {
        caption = c;
        break;
      }
    }

    let youtubeTitlePreview: string | null = null;
    if (postChannels.some((plat) => plat.trim().toLowerCase() === 'youtube')) {
      const ytRow = upload.channels?.find(
        (c) => c.channel.trim().toLowerCase() === 'youtube',
      );
      if (ytRow) youtubeTitlePreview = this.rowYoutubeTitle(ytRow);
    }

    local['detailCaption'] = caption.trim() || null;
    local['youtubeTitlePreview'] = youtubeTitlePreview;
    local['mediaItems'] = this.resolveDetailMediaItems(
      postChannels,
      upload.channels ?? [],
    );
  }

  private resolveListMediaPreview(
    postChannels: string[],
    uploadChannels: UploadChannelEntry[],
  ): { url: string; kind: 'image' | 'video' } | null {
    const keys = new Set(
      postChannels.map((c) => c.trim().toLowerCase()).filter(Boolean),
    );
    let firstVideo: string | null = null;

    for (const row of uploadChannels) {
      const key = row.channel.trim().toLowerCase();
      if (!keys.has(key)) continue;
      for (const url of this.rowAllMedia(row)) {
        if (isVideoMediaUrl(url)) {
          if (!firstVideo) firstVideo = url;
        } else {
          return { url, kind: 'image' };
        }
      }
    }

    if (firstVideo) return { url: firstVideo, kind: 'video' };
    return null;
  }

  async getPostById(
    postId: string,
    auth: TenancyAuth,
  ): Promise<Record<string, unknown>> {
    const filter = mergeUserIdFilter({ postId }, auth);
    const doc = await this.postModel.findOne(filter).lean().exec();
    if (!doc) {
      throw new NotFoundException(`Post ${postId} not found`);
    }
    return doc as unknown as Record<string, unknown>;
  }

  async getPostDetail(
    postId: string,
    auth: TenancyAuth,
    hydrate?: string,
  ): Promise<
    | (Record<string, unknown> & { analytics?: unknown })
    | {
        local: Record<string, unknown>;
        remote: unknown | null;
        analytics?: unknown;
      }
  > {
    const filter = mergeUserIdFilter({ postId }, auth);
    const postDoc = await this.postModel.findOne(filter).exec();
    if (!postDoc) {
      throw new NotFoundException(`Post ${postId} not found`);
    }
    const local = postDoc.toObject() as unknown as Record<string, unknown>;
    await this.enrichPostDetail(local);
    const analytics = await this.postAnalyticsService.getDtoForPost(postDoc);

    const h = hydrate?.trim().toLowerCase();
    if (h !== 'zernio') {
      return analytics ? { ...local, analytics } : local;
    }
    const zid = String(local['zernioPostId'] ?? '').trim();
    const remote =
      zid.length > 0 ? await this.mcpService.getZernioPost(zid) : null;
    return analytics ? { local, remote, analytics } : { local, remote };
  }

  async syncPostAnalytics(
    postId: string,
    auth: TenancyAuth,
  ): Promise<{ analytics: ReturnType<PostAnalyticsService['toDto']> }> {
    const analytics = await this.postAnalyticsService.syncFromZernio(
      postId,
      auth,
    );
    return { analytics };
  }

  async patchPost(
    postId: string,
    dto: PatchPostDto,
    auth: TenancyAuth,
  ): Promise<Record<string, unknown>> {
    const hasScheduled =
      typeof dto.scheduledAt === 'string' && dto.scheduledAt.trim().length > 0;
    const hasContent = dto.content !== undefined;
    const hasTitle = dto.title !== undefined;
    const hasMediaUpdate =
      dto.mediaUrl !== undefined || dto.mediaUrls !== undefined;
    if (!hasScheduled && !hasContent && !hasTitle && !hasMediaUpdate) {
      throw new BadRequestException(
        'Provide at least one field: scheduledAt, content, title, or media.',
      );
    }

    const filter = mergeUserIdFilter({ postId }, auth);
    const post = await this.postModel.findOne(filter).exec();
    if (!post) {
      throw new NotFoundException(`Post ${postId} not found`);
    }
    if (!PATCHABLE_POST_STATUSES.has(post.status)) {
      throw new BadRequestException(
        'This post cannot be edited in its current status.',
      );
    }
    const zid = post.zernioPostId?.trim();
    if (!zid) {
      throw new BadRequestException(
        'Post has no remote id; editing is not supported.',
      );
    }

    const mediaUrlsForZernio = await this.syncUploadFromPostPatch(post, dto, {
      hasContent,
      hasTitle,
      hasMediaUpdate,
      hasScheduled,
    });

    const captionForValidation = hasContent
      ? (dto.content ?? '')
      : await this.resolvePostCaptionForValidation(post);
    const mediaForValidation = hasMediaUpdate
      ? (mediaUrlsForZernio ?? resolvePlatformMediaUrls(dto.mediaUrl, dto.mediaUrls))
      : await this.resolvePostMediaForValidation(post);

    for (const plat of post.channels ?? []) {
      const key = plat.trim().toLowerCase();
      if (hasMediaUpdate) {
        this.assertChannelMediaForPatch(key, mediaForValidation);
      }
      try {
        assertTikTokPhotoCaptionForPublish(
          key,
          captionForValidation,
          mediaForValidation[0] ?? null,
          mediaForValidation,
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg) throw new BadRequestException(msg);
      }
    }

    try {
      await this.mcpService.updatePost({
        postId: zid,
        ...(hasContent ? { content: dto.content } : {}),
        ...(hasTitle ? { title: dto.title ?? '' } : {}),
        ...(hasScheduled ? { scheduledFor: dto.scheduledAt!.trim() } : {}),
        ...(hasMediaUpdate ? { mediaUrls: mediaUrlsForZernio ?? [] } : {}),
      });
    } catch (err: unknown) {
      const msg = getFriendlyZernioPublishError(err);
      throw new BadRequestException(msg || 'Zernio update failed.');
    }

    post.failureReason = null;
    if (hasScheduled) {
      const d = new Date(dto.scheduledAt!.trim());
      post.scheduledAt = Number.isNaN(d.getTime()) ? post.scheduledAt : d;
      post.status = PostStatus.Scheduled;
    }

    await post.save();
    return this.getPostById(postId, auth);
  }

  private assertChannelMediaForPatch(
    channelKey: string,
    mediaUrls: string[],
  ): void {
    if (channelKey !== 'youtube' && channelKey !== 'tiktok') return;
    if (mediaUrls.length === 0) {
      throw new BadRequestException(
        `${channelKey} requires media (image or video).`,
      );
    }
    if (
      channelKey === 'youtube' &&
      !mediaUrls.some((u) => isVideoMediaUrl(u))
    ) {
      throw new BadRequestException(`${channelKey} requires a video.`);
    }
  }

  private async syncUploadFromPostPatch(
    post: PostDocument,
    dto: PatchPostDto,
    flags: {
      hasContent: boolean;
      hasTitle: boolean;
      hasMediaUpdate: boolean;
      hasScheduled: boolean;
    },
  ): Promise<string[] | undefined> {
    const uploadRef = post.uploadRef?.trim();
    if (!uploadRef) {
      if (!flags.hasMediaUpdate) return undefined;
      return resolvePlatformMediaUrls(dto.mediaUrl, dto.mediaUrls);
    }

    const upload = await this.uploadModel.findOne({ uploadId: uploadRef }).exec();
    if (!upload) {
      if (!flags.hasMediaUpdate) return undefined;
      return resolvePlatformMediaUrls(dto.mediaUrl, dto.mediaUrls);
    }

    for (const plat of post.channels ?? []) {
      const key = plat.trim().toLowerCase();
      const row = upload.channels.find(
        (c) => c.channel.trim().toLowerCase() === key,
      );
      if (!row) continue;

      if (flags.hasContent && dto.content !== undefined) {
        row.caption = dto.content ?? '';
      }
      if (flags.hasTitle && key === 'youtube' && dto.title !== undefined) {
        row.youtubeTitle = dto.title?.trim() || null;
      }
      if (flags.hasMediaUpdate) {
        if (dto.mediaUrls !== undefined) {
          row.mediaUrls = [...(dto.mediaUrls ?? [])];
          row.mediaUrl = row.mediaUrls[0] ?? null;
        } else if (dto.mediaUrl !== undefined) {
          row.mediaUrl = dto.mediaUrl;
          row.mediaUrls = dto.mediaUrl ? [dto.mediaUrl] : [];
        }
      }
      if (flags.hasScheduled && dto.scheduledAt) {
        const d = new Date(dto.scheduledAt.trim());
        if (!Number.isNaN(d.getTime())) row.scheduledAt = d;
      }
    }

    upload.status = recomputeUploadJobStatus(upload.channels);
    upload.markModified('channels');
    await upload.save();

    if (!flags.hasMediaUpdate) return undefined;

    const primaryKey = post.channels[0]?.trim().toLowerCase();
    const primaryRow = upload.channels.find(
      (c) => c.channel.trim().toLowerCase() === primaryKey,
    );
    if (primaryRow) return this.rowAllMedia(primaryRow);
    return resolvePlatformMediaUrls(dto.mediaUrl, dto.mediaUrls);
  }

  private async resolvePostCaptionForValidation(
    post: PostDocument,
  ): Promise<string> {
    const uploadRef = post.uploadRef?.trim();
    if (!uploadRef) return '';
    const upload = await this.uploadModel
      .findOne({ uploadId: uploadRef })
      .select('channels resolvedOutputs')
      .lean()
      .exec();
    if (!upload) return '';
    const ro = (upload.resolvedOutputs ?? {}) as ResolvedContentOutputs;
    for (const plat of post.channels ?? []) {
      const key = plat.trim().toLowerCase();
      const row = upload.channels?.find(
        (c) => c.channel.trim().toLowerCase() === key,
      );
      if (!row) continue;
      const caption = this.rowCaption(row, ro);
      if (caption.trim()) return caption;
    }
    return '';
  }

  private async resolvePostMediaForValidation(
    post: PostDocument,
  ): Promise<string[]> {
    const uploadRef = post.uploadRef?.trim();
    if (!uploadRef) return [];
    const upload = await this.uploadModel
      .findOne({ uploadId: uploadRef })
      .select('channels resolvedOutputs')
      .lean()
      .exec();
    if (!upload) return [];
    const ro = (upload.resolvedOutputs ?? {}) as ResolvedContentOutputs;
    for (const plat of post.channels ?? []) {
      const key = plat.trim().toLowerCase();
      const row = upload.channels?.find(
        (c) => c.channel.trim().toLowerCase() === key,
      );
      if (!row) continue;
      const urls = this.rowAllMedia(row);
      if (urls.length > 0) return urls;
      const fallback = (ro.image?.trim() || ro.video?.trim() || '').trim();
      if (fallback) return [fallback];
    }
    return [];
  }

  async bulkSchedulePosts(
    postIds: string[],
    scheduledAt: string,
    auth: TenancyAuth,
  ): Promise<{ succeeded: number; failed: number }> {
    const trimmed = scheduledAt.trim();
    if (!trimmed) {
      throw new BadRequestException('scheduledAt is required.');
    }
    const iso = new Date(trimmed);
    if (Number.isNaN(iso.getTime())) {
      throw new BadRequestException('scheduledAt must be a valid date.');
    }

    const results = await Promise.allSettled(
      postIds.map((id) =>
        this.patchPost(id, { scheduledAt: trimmed }, auth),
      ),
    );
    return {
      succeeded: results.filter((r) => r.status === 'fulfilled').length,
      failed: results.filter((r) => r.status === 'rejected').length,
    };
  }

  async findScheduledPostsForUpload(
    uploadRef: string,
  ): Promise<PostDocument[]> {
    return this.postModel
      .find({
        uploadRef,
        status: PostStatus.Scheduled,
        zernioPostId: { $exists: true, $nin: [null, ''] },
      })
      .exec();
  }

  async updateScheduledPostsOnUpload(
    uploadRef: string,
    opts: { scheduledAt?: Date },
  ): Promise<void> {
    const set: Record<string, unknown> = {};
    if (opts.scheduledAt) set.scheduledAt = opts.scheduledAt;
    if (Object.keys(set).length === 0) return;
    await this.postModel.updateMany(
      { uploadRef, status: PostStatus.Scheduled },
      { $set: set },
    );
  }

  async updateScheduledPostForChannel(
    uploadRef: string,
    channel: string,
    opts: {
      scheduledAt?: Date;
      caption?: string;
    },
  ): Promise<void> {
    const channelKey = channel.trim().toLowerCase();
    const posts = await this.findScheduledPostsForUpload(uploadRef);
    const post = posts.find((p) =>
      (p.channels ?? []).some(
        (c) => String(c).trim().toLowerCase() === channelKey,
      ),
    );
    if (!post) return;

    if (opts.scheduledAt) post.scheduledAt = opts.scheduledAt;
    await post.save();
  }

  findScheduledPostForUploadChannel(
    uploadRef: string,
    channel: string,
  ): Promise<PostDocument | null> {
    const channelKey = channel.trim().toLowerCase();
    return this.postModel
      .findOne({
        uploadRef,
        status: PostStatus.Scheduled,
        zernioPostId: { $exists: true, $nin: [null, ''] },
        channels: channelKey,
      })
      .exec();
  }

  async publishPost(
    postId: string,
    auth: TenancyAuth,
  ): Promise<{ postId: string }> {
    const post = await this.postModel.findOne({ postId }).exec();
    if (!post) throw new NotFoundException(`Post ${postId} not found`);
    this.assertOwnership(post, auth);

    if (!PUBLISHABLE_POST_STATUSES.has(post.status)) {
      throw new BadRequestException(
        'Only pending, scheduled, partial, or failed posts can be published now.',
      );
    }

    if (post.status === PostStatus.Failed) {
      const { newPostId } = await this.retryPost(postId, auth);
      return { postId: newPostId };
    }

    const zid = post.zernioPostId?.trim();
    if (zid) {
      return this.publishExistingZernioPostNow(post, zid, auth);
    }

    return this.publishPostFromUploadNow(post, auth);
  }

  async retryPost(
    postId: string,
    auth: TenancyAuth,
  ): Promise<{ newPostId: string }> {
    const post = await this.postModel.findOne({ postId }).exec();
    if (!post) throw new NotFoundException(`Post ${postId} not found`);
    this.assertOwnership(post, auth);

    if (post.status !== PostStatus.Failed) {
      throw new BadRequestException('Only failed posts can be retried.');
    }

    const upload = await this.uploadModel.findOne({ uploadId: post.uploadRef }).exec();
    if (!upload) {
      throw new NotFoundException(`Upload ${post.uploadRef} not found`);
    }

    const work = await this.buildPublishWorkFromPost(post, upload);

    try {
      const { postId: zernioPostId } = await this.mcpService.publishCreatePostBatch(
        post.userId,
        {
          platforms: work.map((w) => this.workToPlatformPayload(w)),
          publishNow: true,
          scheduledAt: null,
        },
      );

      post.status = PostStatus.Cancelled;
      post.failureReason = 'Superseded by retry.';
      await post.save();

      const newPost = await this.createPublishedPostRecord(
        post,
        work,
        zernioPostId,
        { retryCount: post.retryCount + 1 },
      );

      await this.markUploadChannelsPublished(upload, work);

      return { newPostId: newPost.postId };
    } catch (err: unknown) {
      const msg = getFriendlyZernioPublishError(err);
      post.retryCount = (post.retryCount ?? 0) + 1;
      post.failureReason = msg;
      await post.save();
      throw new BadRequestException(msg);
    }
  }

  private async publishExistingZernioPostNow(
    post: PostDocument,
    zernioPostId: string,
    _auth: TenancyAuth,
  ): Promise<{ postId: string }> {
    try {
      await this.mcpService.updatePost({
        postId: zernioPostId,
        publishNow: true,
        scheduledFor: null,
      });
    } catch (err: unknown) {
      const msg = getFriendlyZernioPublishError(err);
      throw new BadRequestException(msg || 'Zernio publish now failed.');
    }

    const now = new Date();
    const channelKeys = (post.channels ?? []).map((c) =>
      c.trim().toLowerCase(),
    );
    post.status = PostStatus.Published;
    post.scheduledAt = null;
    post.publishedAt = now;
    post.publishedNow = true;
    post.failureReason = null;
    post.platformResults = channelKeys.map((platform) => ({
      platform,
      status: PlatformPostStatus.Published,
      platformUrl: null,
      publishedAt: now,
      failureReason: null,
    }));
    await post.save();

    await this.ensurePostAnalyticsRecord(post);

    await this.patchUploadChannelsFromPost(post.uploadRef, channelKeys, (ch) => {
      ch.status = UploadChannelStatus.Published;
      ch.publishedAt = now;
      ch.scheduledAt = null;
      ch.failureReason = null;
    });

    return { postId: post.postId };
  }

  private async publishPostFromUploadNow(
    post: PostDocument,
    _auth: TenancyAuth,
  ): Promise<{ postId: string }> {
    const upload = await this.uploadModel.findOne({ uploadId: post.uploadRef }).exec();
    if (!upload) {
      throw new NotFoundException(`Upload ${post.uploadRef} not found`);
    }

    const work = await this.buildPublishWorkFromPost(post, upload);

    try {
      const { postId: zernioPostId } = await this.mcpService.publishCreatePostBatch(
        post.userId,
        {
          platforms: work.map((w) => this.workToPlatformPayload(w)),
          publishNow: true,
          scheduledAt: null,
        },
      );

      const now = new Date();
      post.zernioPostId = zernioPostId;
      post.status = PostStatus.Published;
      post.scheduledAt = null;
      post.publishedAt = now;
      post.publishedNow = true;
      post.failureReason = null;
      post.platformResults = work.map((w) => ({
        platform: w.row.channel.trim().toLowerCase(),
        status: PlatformPostStatus.Published,
        platformUrl: null,
        publishedAt: now,
        failureReason: null,
      }));
      await post.save();

      await this.ensurePostAnalyticsRecord(post);

      await this.markUploadChannelsPublished(upload, work);

      return { postId: post.postId };
    } catch (err: unknown) {
      const msg = getFriendlyZernioPublishError(err);
      post.failureReason = msg;
      await post.save();
      throw new BadRequestException(msg);
    }
  }

  private async buildPublishWorkFromPost(
    post: PostDocument,
    upload: UploadDocument,
  ): Promise<PublishWorkItem[]> {
    const accountByChannel = await this.loadAccountMapForRetry(post.userId);
    const ro = upload.resolvedOutputs ?? {};
    const work: PublishWorkItem[] = [];

    for (const plat of post.channels ?? []) {
      const key = plat.trim().toLowerCase();
      const row = upload.channels.find(
        (c) => c.channel.trim().toLowerCase() === key,
      );
      if (!row || row.status === UploadChannelStatus.Skipped) continue;
      const accountId = accountByChannel.get(key)?.trim();
      if (!accountId) {
        throw new BadRequestException(
          `${row.channel} is not connected. Please connect in Settings first.`,
        );
      }
      const caption = this.rowCaption(row, ro);
      if (!caption.trim()) {
        throw new BadRequestException(
          `No caption available for ${row.channel}.`,
        );
      }
      const mediaUrls = this.rowAllMedia(row);
      const mediaUrl = mediaUrls[0] ?? null;
      const youtubeTitle =
        key === 'youtube' ? this.rowYoutubeTitle(row) : null;
      work.push({
        row,
        accountId,
        caption,
        mediaUrl,
        mediaUrls,
        youtubeTitle,
      });
    }

    if (work.length === 0) {
      throw new BadRequestException('No publishable channels on this post.');
    }

    return work;
  }

  private workToPlatformPayload(w: PublishWorkItem): {
    platform: string;
    accountId: string;
    content: string;
    mediaUrl: string | null;
    mediaUrls: string[] | null;
    title: string | null;
  } {
    const platform = w.row.channel.trim().toLowerCase();
    return {
      platform,
      accountId: w.accountId,
      content: w.caption,
      mediaUrl: w.mediaUrl,
      mediaUrls: w.mediaUrls.length ? w.mediaUrls : null,
      title: w.youtubeTitle,
    };
  }

  private async createPublishedPostRecord(
    source: PostDocument,
    work: PublishWorkItem[],
    zernioPostId: string,
    opts?: { retryCount?: number },
  ): Promise<PostDocument> {
    const now = new Date();
    return this.postModel.create({
      userId: source.userId,
      uploadRef: source.uploadRef,
      ruleRef: source.ruleRef,
      contentRef: source.contentRef,
      zernioPostId,
      channels: work.map((w) => w.row.channel.trim().toLowerCase()),
      status: PostStatus.Published,
      scheduledAt: null,
      publishedAt: now,
      publishedNow: true,
      retryCount: opts?.retryCount ?? source.retryCount ?? 0,
      failureReason: null,
      platformResults: work.map((w) => ({
        platform: w.row.channel.trim().toLowerCase(),
        status: PlatformPostStatus.Published,
        platformUrl: null,
        publishedAt: now,
        failureReason: null,
      })),
    }).then(async (created) => {
      await this.ensurePostAnalyticsRecord(created);
      return created;
    });
  }

  private async markUploadChannelsPublished(
    upload: UploadDocument,
    work: PublishWorkItem[],
  ): Promise<void> {
    const now = new Date();
    for (const w of work) {
      w.row.status = UploadChannelStatus.Published;
      w.row.publishedAt = now;
      w.row.scheduledAt = null;
      w.row.failureReason = null;
    }
    upload.status = recomputeUploadJobStatus(upload.channels);
    upload.markModified('channels');
    await upload.save();
  }

  async deletePost(
    postId: string,
    auth: TenancyAuth,
  ): Promise<{
    success: true;
    skipped: string[];
    message: string;
    removed: boolean;
  }> {
    const post = await this.postModel.findOne({ postId }).exec();
    if (!post) throw new NotFoundException(`Post ${postId} not found`);
    this.assertOwnership(post, auth);

    if (post.status === PostStatus.Cancelled) {
      return {
        success: true,
        skipped: [],
        message: 'Post is already cancelled.',
        removed: false,
      };
    }

    const channels = post.channels.map((c) => c.trim().toLowerCase());

    if (
      post.status === PostStatus.Published ||
      post.status === PostStatus.Partial
    ) {
      return await this.unpublishAndCancelPost(post, channels);
    }

    const zernioId = post.zernioPostId?.trim();
    if (zernioId) {
      await this.mcpService.deleteZernioPost(zernioId);
    }

    await this.postModel.deleteOne({ postId }).exec();
    await this.resetUploadChannelsToPending(post.uploadRef, channels);

    return {
      success: true,
      skipped: [],
      message: 'Post deleted.',
      removed: true,
    };
  }

  async bulkDeletePosts(
    postIds: string[],
    auth: TenancyAuth,
  ): Promise<{
    total: number;
    succeeded: number;
    failed: number;
    skipped: Record<string, string[]>;
  }> {
    const skipped: Record<string, string[]> = {};
    const results = await Promise.allSettled(
      postIds.map((id) => this.deletePost(id, auth)),
    );
    let succeeded = 0;
    let failed = 0;
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        succeeded += 1;
        const postId = postIds[index]!;
        if (result.value.skipped.length > 0) {
          skipped[postId] = result.value.skipped;
        }
      } else {
        failed += 1;
      }
    });
    return { total: postIds.length, succeeded, failed, skipped };
  }

  async bulkCancelScheduled(
    postIds: string[],
    auth: TenancyAuth,
  ): Promise<{ succeeded: number; failed: number }> {
    const result = await this.bulkDeletePosts(postIds, auth);
    return { succeeded: result.succeeded, failed: result.failed };
  }

  private async unpublishAndCancelPost(
    post: PostDocument,
    channels: string[],
  ): Promise<{
    success: true;
    skipped: string[];
    message: string;
    removed: boolean;
  }> {
    const skipped: string[] = [];
    const successfulPlatforms: string[] = [];
    const zernioId = post.zernioPostId?.trim();

    if (zernioId) {
      for (const platform of channels) {
        const result = await this.mcpService.unpublishZernioPost(
          zernioId,
          platform,
        );
        if (result.notSupported) {
          skipped.push(platform);
          continue;
        }
        if (result.success) {
          successfulPlatforms.push(platform);
        }
      }
    } else {
      successfulPlatforms.push(...channels);
    }

    if (post.platformResults?.length) {
      const successSet = new Set(successfulPlatforms);
      for (const pr of post.platformResults) {
        const plat = pr.platform.trim().toLowerCase();
        if (!successSet.has(plat)) continue;
        pr.status = PlatformPostStatus.Cancelled;
        pr.publishedAt = null;
        pr.platformUrl = null;
        pr.failureReason = null;
      }
    }

    post.status = PostStatus.Cancelled;
    post.publishedAt = null;
    post.scheduledAt = null;
    post.failureReason =
      skipped.length > 0
        ? `Cancelled; unpublish not supported for: ${skipped.join(', ')}`
        : 'Post unpublished.';
    await post.save();

    if (successfulPlatforms.length > 0) {
      await this.patchUploadChannelsFromPost(
        post.uploadRef,
        successfulPlatforms,
        (ch) => {
          ch.status = UploadChannelStatus.Pending;
          ch.scheduledAt = null;
          ch.publishedAt = null;
          ch.failureReason = null;
        },
      );
    }

    const message =
      skipped.length > 0
        ? `Post cancelled. Unpublish skipped for: ${skipped.join(', ')}`
        : 'Post unpublished.';

    return {
      success: true,
      skipped,
      message,
      removed: false,
    };
  }

  private async resetUploadChannelsToPending(
    uploadRef: string,
    platforms: string[],
  ): Promise<void> {
    await this.patchUploadChannelsFromPost(uploadRef, platforms, (ch) => {
      ch.status = UploadChannelStatus.Pending;
      ch.scheduledAt = null;
      ch.publishedAt = null;
      ch.failureReason = null;
    });
  }

  async bulkPublishNow(
    postIds: string[],
    auth: TenancyAuth,
  ): Promise<{ succeeded: number; failed: number }> {
    const results = await Promise.allSettled(
      postIds.map((id) => this.publishPost(id, auth)),
    );
    return {
      succeeded: results.filter((r) => r.status === 'fulfilled').length,
      failed: results.filter((r) => r.status === 'rejected').length,
    };
  }

  private assertOwnership(post: PostDocument, auth: TenancyAuth): void {
    if (auth.role === UserRole.ADMIN) return;
    if (post.userId !== auth.userId) {
      throw new NotFoundException(`Post ${post.postId} not found`);
    }
  }

  private async loadAccountMapForRetry(
    userId: string,
  ): Promise<Map<string, string>> {
    const { accounts } = await this.mcpService.getConnectedAccounts(userId);
    return new Map(
      accounts.map((a) => [a.channel.trim().toLowerCase(), a.accountId]),
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

  private fallbackPrimaryCaption(r: ResolvedContentOutputs): string {
    for (const s of [r.text, r.translatedText, r.summary]) {
      const t = s?.trim();
      if (t) return t;
    }
    return '';
  }

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

  private rowYoutubeTitle(row: UploadChannelEntry): string | null {
    const t = (row.youtubeTitle ?? '').trim();
    return t.length > 0 ? t : null;
  }

  /** Used by webhook/sync when marking upload rows from a Post’s platform list. */
  async applyChannelFailureOnUpload(
    uploadRef: string,
    platforms: string[],
    message: string,
    opts?: { clearScheduled?: boolean },
  ): Promise<void> {
    const upload = await this.uploadModel.findOne({ uploadId: uploadRef }).exec();
    if (!upload) return;

    const keys = new Set(platforms.map((p) => p.trim().toLowerCase()));
    for (const ch of upload.channels) {
      if (!keys.has(ch.channel.trim().toLowerCase())) continue;
      if (ch.status === UploadChannelStatus.Skipped) continue;
      ch.status = UploadChannelStatus.Failed;
      ch.failureReason = message;
      if (opts?.clearScheduled) {
        ch.scheduledAt = null;
      }
    }
    upload.status = recomputeUploadJobStatus(upload.channels);
    upload.markModified('channels');
    await upload.save();
  }

  async patchUploadChannelsFromPost(
    uploadRef: string,
    platforms: string[],
    mutate: (ch: UploadChannelEntry) => void,
  ): Promise<UploadDocument | null> {
    const doc = await this.uploadModel.findOne({ uploadId: uploadRef }).exec();
    if (!doc) return null;
    const keys = new Set(platforms.map((p) => p.trim().toLowerCase()));
    for (const ch of doc.channels) {
      if (!keys.has(ch.channel.trim().toLowerCase())) continue;
      if (ch.status === UploadChannelStatus.Skipped) continue;
      mutate(ch);
    }
    doc.status = recomputeUploadJobStatus(doc.channels);
    doc.markModified('channels');
    await doc.save();
    return doc;
  }
}
