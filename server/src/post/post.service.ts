import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { TenancyAuth } from '../auth/tenancy.types';
import { mergeTenancyWhere } from '../repositories/prisma/prisma.util';
import type { ResolvedContentOutputs } from '../content/content-output.utils';
import { UserRole } from '../users/schemas/user.schema';
import { getFriendlyZernioPublishError } from '../mcp/zernio/zernio-mcp-publish.util';
import {
  assertTikTokPhotoCaptionForPublish,
  resolvePlatformMediaUrls,
} from '../mcp/zernio/tiktok-publish.util';
import { McpService } from '../mcp/mcp.service';
import type { IPostRepository } from '../repositories/interfaces/post.repository.interface';
import type { PostRecord } from '../repositories/interfaces/post.repository.interface';
import type { IUploadRepository } from '../repositories/interfaces/upload.repository.interface';
import type { UploadRecord } from '../repositories/interfaces/upload.repository.interface';
import {
  POST_REPOSITORY,
  UPLOAD_REPOSITORY,
} from '../repositories/tokens';
import { SchedulerService } from '../scheduler/scheduler.service';
import {
  UploadChannelStatus,
  type UploadChannelEntry,
} from '../upload/schemas/upload.schema';
import {
  postPlatformResults,
  uploadChannels,
  withPostPlatformResults,
  withUploadChannels,
} from '../upload/upload-record.util';
import { recomputeUploadJobStatus } from '../upload/upload-status.util';
import { PostAnalyticsService } from './post-analytics.service';
import { isZernioRemotePostId } from './is-zernio-remote-post-id.util';
import { ListPostsQueryDto } from './dto/list-posts-query.dto';
import { PostListSort } from './dto/post-list-sort.enum';
import type { PatchPostDto } from './dto/patch-post.dto';
import {
  PlatformPostStatus,
  PostStatus,
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

function isVideoMediaUrl(url: string): boolean {
  return /\.(mp4|webm|mov|m4v|mkv)(\?|$)/i.test(url.trim());
}

@Injectable()
export class PostService {
  constructor(
    @Inject(POST_REPOSITORY)
    private readonly posts: IPostRepository,
    @Inject(UPLOAD_REPOSITORY)
    private readonly uploads: IUploadRepository,
    private readonly mcpService: McpService,
    private readonly postAnalyticsService: PostAnalyticsService,
    private readonly scheduler: SchedulerService,
  ) {}

  /** Unscoped lookup for internal jobs (scheduler Redis consumer). */
  findByPostIdInternal(postId: string): Promise<PostRecord | null> {
    return this.posts.findByPostId(postId.trim());
  }

  /**
   * Removes a post that was created during schedule/publish but never became
   * usable (e.g. Mosonic scheduler registration failed after the draft/post
   * row was written). Does not mutate upload channel rows.
   */
  async discardOrphanedPost(postId: string): Promise<void> {
    const id = postId.trim();
    if (!id) return;
    const post = await this.posts.findByPostId(id);
    if (!post) return;

    await this.scheduler.cancelPostPublish(id);

    const zernioId = post.zernioPostId?.trim();
    if (zernioId && isZernioRemotePostId(zernioId)) {
      try {
        await this.mcpService.deleteZernioPost(zernioId);
      } catch {
        // Best-effort cleanup; upload failure path still reports the schedule error.
      }
    }

    await this.posts.deleteByPostId(id);
  }

  private async ensurePostAnalyticsRecord(post: PostRecord): Promise<void> {
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

    const doc = await this.posts.create({
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
      platformResults: platformResults as unknown as Prisma.InputJsonValue,
      retryCount: 0,
      failureReason: null,
    });

    return { postId: doc.postId };
  }

  findByZernioPostId(zernioPostId: string): Promise<PostRecord | null> {
    return this.posts.findByZernioPostId(zernioPostId);
  }

  async getPostStats(auth: TenancyAuth): Promise<{
    total: number;
    byStatus: Partial<Record<PostStatus, number>>;
  }> {
    const byStatus = await this.posts.aggregateStatusCounts(
      mergeTenancyWhere({}, auth),
    );
    const total = Object.values(byStatus).reduce((sum, n) => sum + (n ?? 0), 0);
    return { total, byStatus: byStatus as Partial<Record<PostStatus, number>> };
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
    const filter: Prisma.PostWhereInput = {};
    if (query.status) filter.status = query.status;
    if (query.ruleRef?.trim()) filter.ruleRef = query.ruleRef.trim();
    if (query.uploadRef?.trim()) filter.uploadRef = query.uploadRef.trim();

    const ch = query.channel?.trim().toLowerCase();
    if (ch) {
      filter.channels = { has: ch };
    }

    const searchTerm = query.search?.trim();
    if (searchTerm) {
      filter.OR = [
        { postId: { contains: searchTerm, mode: 'insensitive' } },
        { uploadRef: { contains: searchTerm, mode: 'insensitive' } },
        { contentRef: { contains: searchTerm, mode: 'insensitive' } },
        { ruleRef: { contains: searchTerm, mode: 'insensitive' } },
      ];
    }

    if (query.from || query.to) {
      const createdAt: Prisma.DateTimeFilter = {};
      if (query.from) {
        const d = new Date(query.from);
        if (!Number.isNaN(d.getTime())) createdAt.gte = d;
      }
      if (query.to) {
        const d = new Date(query.to);
        if (!Number.isNaN(d.getTime())) createdAt.lte = d;
      }
      if (Object.keys(createdAt).length > 0) filter.createdAt = createdAt;
    }

    const scoped = mergeTenancyWhere(filter, auth);
    const page = query.page;
    const limit = query.limit;
    const { sortBy, sortOrder } = this.listPostsSort(query.sort);

    const { rows: postsRaw, total } = await this.posts.findPage(
      scoped,
      page,
      limit,
      sortBy,
      sortOrder,
    );

    const posts = postsRaw.map((p) => this.postToRecord(p));
    await this.attachListCaptionPreviews(posts);

    return {
      posts,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  private listPostsSort(sort?: PostListSort): {
    sortBy: string;
    sortOrder: 'asc' | 'desc';
  } {
    switch (sort) {
      case PostListSort.OldestCreated:
        return { sortBy: 'createdAt', sortOrder: 'asc' };
      case PostListSort.ScheduledDesc:
        return { sortBy: 'scheduledAt', sortOrder: 'desc' };
      case PostListSort.ScheduledAsc:
        return { sortBy: 'scheduledAt', sortOrder: 'asc' };
      case PostListSort.StatusAsc:
        return { sortBy: 'status', sortOrder: 'asc' };
      case PostListSort.NewestCreated:
      default:
        return { sortBy: 'createdAt', sortOrder: 'desc' };
    }
  }

  private postToRecord(post: PostRecord): Record<string, unknown> {
    return { ...post };
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

    const uploads = await this.uploads.findByUploadIds(refs);

    const byId = new Map(uploads.map((u) => [String(u.uploadId), u]));

    const CAP_LEN = 160;

    for (const p of posts) {
      const ref = String(p['uploadRef'] ?? '').trim();
      const u = byId.get(ref);
      if (!u) continue;

      const ro = (u.resolvedOutputs ?? {}) as ResolvedContentOutputs;
      const postChannels = (p['channels'] as string[] | undefined) ?? [];
      const uploadChannelRows = uploadChannels(u);

      let caption = '';
      for (const plat of postChannels) {
        const key = plat.trim().toLowerCase();
        const row = uploadChannelRows.find(
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
        const ytRow = uploadChannelRows.find(
          (c) => c.channel.trim().toLowerCase() === 'youtube',
        );
        if (ytRow) youtubeTitlePreview = this.rowYoutubeTitle(ytRow);
      }

      const trimmed = caption.trim();
      p['captionPreview'] =
        trimmed.length > CAP_LEN ? `${trimmed.slice(0, CAP_LEN)}…` : trimmed || null;
      p['youtubeTitlePreview'] = youtubeTitlePreview;

      const mediaPreview = this.resolveListMediaPreview(
        postChannels,
        uploadChannelRows,
      );
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

    const upload = await this.uploads.findByUploadId(ref);
    if (!upload) return;

    const postChannels = (local['channels'] as string[] | undefined) ?? [];
    const ro = (upload.resolvedOutputs ?? {}) as ResolvedContentOutputs;
    const uploadChannelRows = uploadChannels(upload);

    let caption = '';
    for (const plat of postChannels) {
      const key = plat.trim().toLowerCase();
      const row = uploadChannelRows.find(
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
      const ytRow = uploadChannelRows.find(
        (c) => c.channel.trim().toLowerCase() === 'youtube',
      );
      if (ytRow) youtubeTitlePreview = this.rowYoutubeTitle(ytRow);
    }

    local['detailCaption'] = caption.trim() || null;
    local['youtubeTitlePreview'] = youtubeTitlePreview;
    local['mediaItems'] = this.resolveDetailMediaItems(
      postChannels,
      uploadChannelRows,
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
    const doc = await this.posts.findByPostId(postId, auth);
    if (!doc) {
      throw new NotFoundException(`Post ${postId} not found`);
    }
    return this.postToRecord(doc);
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
    const postDoc = await this.posts.findByPostId(postId, auth);
    if (!postDoc) {
      throw new NotFoundException(`Post ${postId} not found`);
    }
    const local = this.postToRecord(postDoc);
    await this.enrichPostDetail(local);
    const analytics = await this.postAnalyticsService.getDtoForPost(postDoc);

    const h = hydrate?.trim().toLowerCase();
    if (h !== 'zernio') {
      return analytics ? { ...local, analytics } : local;
    }
    const zid = String(local['zernioPostId'] ?? '').trim();
    const remote = isZernioRemotePostId(zid)
      ? await this.mcpService.getZernioPost(zid)
      : null;
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

    const post = await this.posts.findByPostId(postId, auth);
    if (!post) {
      throw new NotFoundException(`Post ${postId} not found`);
    }
    if (!PATCHABLE_POST_STATUSES.has(post.status as PostStatus)) {
      throw new BadRequestException(
        'This post cannot be edited in its current status.',
      );
    }
    const zid = post.zernioPostId?.trim();
    if (!zid || !isZernioRemotePostId(zid)) {
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

    let nextPost: PostRecord = { ...post, failureReason: null };
    if (hasScheduled) {
      const d = new Date(dto.scheduledAt!.trim());
      if (!Number.isNaN(d.getTime())) {
        nextPost = { ...nextPost, scheduledAt: d, status: PostStatus.Scheduled };
      }
    }

    await this.posts.save(nextPost);
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
    post: PostRecord,
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

    const upload = await this.uploads.findByUploadId(uploadRef);
    if (!upload) {
      if (!flags.hasMediaUpdate) return undefined;
      return resolvePlatformMediaUrls(dto.mediaUrl, dto.mediaUrls);
    }

    const channels = uploadChannels(upload);
    for (const plat of post.channels ?? []) {
      const key = plat.trim().toLowerCase();
      const row = channels.find(
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

    await this.uploads.save({
      ...withUploadChannels(upload, channels),
      status: recomputeUploadJobStatus(channels),
    });

    if (!flags.hasMediaUpdate) return undefined;

    const primaryKey = post.channels[0]?.trim().toLowerCase();
    const primaryRow = channels.find(
      (c) => c.channel.trim().toLowerCase() === primaryKey,
    );
    if (primaryRow) return this.rowAllMedia(primaryRow);
    return resolvePlatformMediaUrls(dto.mediaUrl, dto.mediaUrls);
  }

  private async resolvePostCaptionForValidation(
    post: PostRecord,
  ): Promise<string> {
    const uploadRef = post.uploadRef?.trim();
    if (!uploadRef) return '';
    const upload = await this.uploads.findByUploadId(uploadRef);
    if (!upload) return '';
    const ro = (upload.resolvedOutputs ?? {}) as ResolvedContentOutputs;
    const channels = uploadChannels(upload);
    for (const plat of post.channels ?? []) {
      const key = plat.trim().toLowerCase();
      const row = channels.find(
        (c) => c.channel.trim().toLowerCase() === key,
      );
      if (!row) continue;
      const caption = this.rowCaption(row, ro);
      if (caption.trim()) return caption;
    }
    return '';
  }

  private async resolvePostMediaForValidation(
    post: PostRecord,
  ): Promise<string[]> {
    const uploadRef = post.uploadRef?.trim();
    if (!uploadRef) return [];
    const upload = await this.uploads.findByUploadId(uploadRef);
    if (!upload) return [];
    const ro = (upload.resolvedOutputs ?? {}) as ResolvedContentOutputs;
    const channels = uploadChannels(upload);
    for (const plat of post.channels ?? []) {
      const key = plat.trim().toLowerCase();
      const row = channels.find(
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
  ): Promise<PostRecord[]> {
    const rows = await this.posts.findByUploadRef(uploadRef, {
      status: PostStatus.Scheduled,
    });
    return rows.filter((p) => Boolean(p.zernioPostId?.trim()));
  }

  async updateScheduledPostsOnUpload(
    uploadRef: string,
    opts: { scheduledAt?: Date },
  ): Promise<void> {
    if (!opts.scheduledAt) return;
    await this.posts.updateManyScheduledByUpload(uploadRef, {
      scheduledAt: opts.scheduledAt,
    });
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

    if (opts.scheduledAt) {
      await this.posts.save({ ...post, scheduledAt: opts.scheduledAt });
    }
  }

  async findScheduledPostForUploadChannel(
    uploadRef: string,
    channel: string,
  ): Promise<PostRecord | null> {
    const channelKey = channel.trim().toLowerCase();
    const posts = await this.findScheduledPostsForUpload(uploadRef);
    return (
      posts.find((p) =>
        (p.channels ?? []).some(
          (c) => String(c).trim().toLowerCase() === channelKey,
        ),
      ) ?? null
    );
  }

  async publishPost(
    postId: string,
    auth: TenancyAuth,
  ): Promise<{ postId: string }> {
    const post = await this.posts.findByPostId(postId, auth);
    if (!post) throw new NotFoundException(`Post ${postId} not found`);
    this.assertOwnership(post, auth);

    if (!PUBLISHABLE_POST_STATUSES.has(post.status as PostStatus)) {
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
    const post = await this.posts.findByPostId(postId, auth);
    if (!post) throw new NotFoundException(`Post ${postId} not found`);
    this.assertOwnership(post, auth);

    if (post.status !== PostStatus.Failed) {
      throw new BadRequestException('Only failed posts can be retried.');
    }

    const upload = await this.uploads.findByUploadId(post.uploadRef);
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

      await this.posts.save({
        ...post,
        status: PostStatus.Cancelled,
        failureReason: 'Superseded by retry.',
      });

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
      await this.posts.save({
        ...post,
        retryCount: (post.retryCount ?? 0) + 1,
        failureReason: msg,
      });
      throw new BadRequestException(msg);
    }
  }

  private async publishExistingZernioPostNow(
    post: PostRecord,
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
    const saved = await this.posts.save({
      ...withPostPlatformResults(
        post,
        channelKeys.map((platform) => ({
          platform,
          status: PlatformPostStatus.Published,
          platformUrl: null,
          publishedAt: now,
          failureReason: null,
        })),
      ),
      status: PostStatus.Published,
      scheduledAt: null,
      publishedAt: now,
      publishedNow: true,
      failureReason: null,
    });

    await this.ensurePostAnalyticsRecord(saved);

    await this.patchUploadChannelsFromPost(post.uploadRef, channelKeys, (ch) => {
      ch.status = UploadChannelStatus.Published;
      ch.publishedAt = now;
      ch.scheduledAt = null;
      ch.failureReason = null;
    });

    return { postId: saved.postId };
  }

  private async publishPostFromUploadNow(
    post: PostRecord,
    _auth: TenancyAuth,
  ): Promise<{ postId: string }> {
    const upload = await this.uploads.findByUploadId(post.uploadRef);
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
      const saved = await this.posts.save({
        ...withPostPlatformResults(
          post,
          work.map((w) => ({
            platform: w.row.channel.trim().toLowerCase(),
            status: PlatformPostStatus.Published,
            platformUrl: null,
            publishedAt: now,
            failureReason: null,
          })),
        ),
        zernioPostId,
        status: PostStatus.Published,
        scheduledAt: null,
        publishedAt: now,
        publishedNow: true,
        failureReason: null,
      });

      await this.ensurePostAnalyticsRecord(saved);

      await this.markUploadChannelsPublished(upload, work);

      return { postId: saved.postId };
    } catch (err: unknown) {
      const msg = getFriendlyZernioPublishError(err);
      await this.posts.save({ ...post, failureReason: msg });
      throw new BadRequestException(msg);
    }
  }

  private async buildPublishWorkFromPost(
    post: PostRecord,
    upload: UploadRecord,
  ): Promise<PublishWorkItem[]> {
    const accountByChannel = await this.loadAccountMapForRetry(post.userId);
    const ro = (upload.resolvedOutputs ?? {}) as ResolvedContentOutputs;
    const channels = uploadChannels(upload);
    const work: PublishWorkItem[] = [];

    for (const plat of post.channels ?? []) {
      const key = plat.trim().toLowerCase();
      const row = channels.find(
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
    source: PostRecord,
    work: PublishWorkItem[],
    zernioPostId: string,
    opts?: { retryCount?: number },
  ): Promise<PostRecord> {
    const now = new Date();
    const created = await this.posts.create({
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
      })) as Prisma.InputJsonValue,
    });
    await this.ensurePostAnalyticsRecord(created);
    return created;
  }

  private async markUploadChannelsPublished(
    upload: UploadRecord,
    work: PublishWorkItem[],
  ): Promise<void> {
    const now = new Date();
    const channels = uploadChannels(upload);
    for (const w of work) {
      w.row.status = UploadChannelStatus.Published;
      w.row.publishedAt = now;
      w.row.scheduledAt = null;
      w.row.failureReason = null;
    }
    await this.uploads.save({
      ...withUploadChannels(upload, channels),
      status: recomputeUploadJobStatus(channels),
    });
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
    const post = await this.posts.findByPostId(postId, auth);
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

    if (post.status === PostStatus.Scheduled) {
      await this.scheduler.cancelPostPublish(post.postId);
    }

    const zernioId = post.zernioPostId?.trim();
    if (zernioId) {
      await this.mcpService.deleteZernioPost(zernioId);
    }

    await this.posts.deleteByPostId(postId);
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
    post: PostRecord,
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

    let platformResults = postPlatformResults(post);
    if (platformResults.length > 0) {
      const successSet = new Set(successfulPlatforms);
      platformResults = platformResults.map((pr) => {
        const plat = pr.platform.trim().toLowerCase();
        if (!successSet.has(plat)) return pr;
        return {
          ...pr,
          status: PlatformPostStatus.Cancelled,
          publishedAt: null,
          platformUrl: null,
          failureReason: null,
        };
      });
    }

    await this.posts.save({
      ...withPostPlatformResults(post, platformResults),
      status: PostStatus.Cancelled,
      publishedAt: null,
      scheduledAt: null,
      failureReason:
        skipped.length > 0
          ? `Cancelled; unpublish not supported for: ${skipped.join(', ')}`
          : 'Post unpublished.',
    });

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

  private assertOwnership(post: PostRecord, auth: TenancyAuth): void {
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
    const upload = await this.uploads.findByUploadId(uploadRef);
    if (!upload) return;

    const keys = new Set(platforms.map((p) => p.trim().toLowerCase()));
    const channels = uploadChannels(upload);
    for (const ch of channels) {
      if (!keys.has(ch.channel.trim().toLowerCase())) continue;
      if (ch.status === UploadChannelStatus.Skipped) continue;
      ch.status = UploadChannelStatus.Failed;
      ch.failureReason = message;
      if (opts?.clearScheduled) {
        ch.scheduledAt = null;
      }
    }
    await this.uploads.save({
      ...withUploadChannels(upload, channels),
      status: recomputeUploadJobStatus(channels),
    });
  }

  async patchUploadChannelsFromPost(
    uploadRef: string,
    platforms: string[],
    mutate: (ch: UploadChannelEntry) => void,
  ): Promise<UploadRecord | null> {
    const upload = await this.uploads.findByUploadId(uploadRef);
    if (!upload) return null;
    const keys = new Set(platforms.map((p) => p.trim().toLowerCase()));
    const channels = uploadChannels(upload);
    for (const ch of channels) {
      if (!keys.has(ch.channel.trim().toLowerCase())) continue;
      if (ch.status === UploadChannelStatus.Skipped) continue;
      mutate(ch);
    }
    return this.uploads.save({
      ...withUploadChannels(upload, channels),
      status: recomputeUploadJobStatus(channels),
    });
  }
}
