import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { TenancyAuth } from '../../auth/tenancy.types';
import type { ContentService } from '../../content/content.service';
import type { IContentRepository } from '../../repositories/interfaces/content.repository.interface';
import type { UploadService, UploadDetailDto } from '../../upload/upload.service';
import type { PostService } from '../../post/post.service';
import { PostStatus } from '../../post/schemas/post.schema';
import { UploadChannelStatus } from '../../upload/schemas/upload.schema';
import type { WorkflowService } from '../../workflow/workflow.service';
import { normalizeChannelId } from '../../workflow/distribution-channels.util';
import {
  resolveContentForSession,
  showContentPayload,
  previewFromRecord,
} from './content-scope.util';
import { runTool, toolError, toolOk } from './tool-error.util';

const CONTENT_ID_SCHEMA = z
  .string()
  .optional()
  .describe('Content id. Omit to use the latest draft on this brand.');

const CHANNELS_SCHEMA = z
  .array(z.string().min(1))
  .optional()
  .describe(
    'Channels to include (e.g. ["tiktok"]). Omit to publish every included channel on the upload.',
  );

async function resolveUploadForContent(
  uploadService: UploadService,
  contentService: ContentService,
  contentId: string,
  auth: TenancyAuth,
): Promise<{ uploadId: string }> {
  try {
    const approved = await contentService.approveContent(contentId, auth);
    if (approved?.uploadId) return { uploadId: approved.uploadId };
  } catch {
    // Content is already approved or no pending approval steps
  }
  return await uploadService.findUploadIdByContentRef(contentId, auth);
}

function channelIncludeList(
  detailChannels: Array<{ channel: string; included: boolean }>,
  requested?: string[],
): Array<{ channel: string; included: boolean }> {
  if (!requested?.length) {
    return detailChannels.map((c) => ({
      channel: c.channel,
      included: Boolean(c.included),
    }));
  }
  const want = new Set(requested.map(normalizeChannelId));
  return detailChannels.map((c) => ({
    channel: c.channel,
    included: want.has(normalizeChannelId(c.channel)),
  }));
}

/** Channels whose platform rejects a post without media. */
export const MEDIA_REQUIRED_CHANNELS: ReadonlySet<string> = new Set(['tiktok', 'youtube', 'rednote', 'instagram']);
const CAPTION_PREVIEW = 160;

type ChannelRow = UploadDetailDto['channels'][number];

function channelMedia(c: Pick<ChannelRow, 'mediaUrl' | 'mediaUrls'>): string[] {
  const list = [...(c.mediaUrls ?? [])];
  if (c.mediaUrl && !list.includes(c.mediaUrl)) list.unshift(c.mediaUrl);
  return list.filter((u) => typeof u === 'string' && u.trim().length > 0);
}

function channelView(c: ChannelRow) {
  const caption = c.caption?.trim() ?? '';
  return {
    channel: c.channel,
    included: c.included,
    status: c.status,
    hasCaption: caption.length > 0,
    captionPreview: caption ? caption.slice(0, CAPTION_PREVIEW) : null,
    hasMedia: channelMedia(c).length > 0,
    mediaUrls: channelMedia(c),
    youtubeTitle: c.youtubeTitle ?? null,
    scheduledAt: c.scheduledAt ?? null,
    publishedAt: c.publishedAt ?? null,
    failureReason: c.failureReason,
  };
}

export type UploadIssue = { channel: string; problem: string };

/**
 * Pre-publish check on the included channels (or the given include list):
 * at least one channel, a caption each, media where the platform needs it,
 * a YouTube title. Connection status is not checked here (check_channel_auth).
 */
export function validateUploadDetail(
  detail: Pick<UploadDetailDto, 'channels'>,
  include?: Array<{ channel: string; included: boolean }>,
): { ok: boolean; issues: UploadIssue[] } {
  const wanted = include
    ? new Set(include.filter((c) => c.included).map((c) => normalizeChannelId(c.channel)))
    : null;
  const rows = detail.channels.filter((c) =>
    wanted ? wanted.has(normalizeChannelId(c.channel)) : c.included,
  );
  const issues: UploadIssue[] = [];
  if (!rows.length) issues.push({ channel: '*', problem: 'no channel is included' });
  for (const c of rows) {
    const id = normalizeChannelId(c.channel);
    if (!c.caption?.trim() && id !== 'youtube') issues.push({ channel: c.channel, problem: 'caption is empty' });
    if (MEDIA_REQUIRED_CHANNELS.has(id) && channelMedia(c).length === 0) {
      issues.push({ channel: c.channel, problem: 'needs an image or video (add_upload_media)' });
    }
    if (id === 'youtube' && !c.youtubeTitle?.trim()) issues.push({ channel: c.channel, problem: 'YouTube title is empty' });
  }
  return { ok: issues.length === 0, issues };
}

function pickChannels(
  detail: Pick<UploadDetailDto, 'channels'>,
  requested?: string[],
): { rows: ChannelRow[]; unknown: string[] } {
  if (!requested?.length) return { rows: detail.channels.filter((c) => c.included), unknown: [] };
  const want = requested.map(normalizeChannelId);
  const rows = detail.channels.filter((c) => want.includes(normalizeChannelId(c.channel)));
  const known = new Set(rows.map((c) => normalizeChannelId(c.channel)));
  return { rows, unknown: want.filter((w) => !known.has(w)) };
}

/** Resolves an upload for the session's content without approving it. */
async function existingUpload(
  ruleId: string,
  workflowService: WorkflowService,
  contents: IContentRepository,
  uploadService: UploadService,
  auth: TenancyAuth,
  args: { contentId?: string; workflowId?: string },
): Promise<{ ok: true; uploadId: string; contentId: string } | { ok: false; observation: string }> {
  const scoped = await resolveContentForSession(workflowService, contents, ruleId, auth, args);
  if (!scoped.ok) return { ok: false, observation: scoped.observation };
  try {
    const { uploadId } = await uploadService.findUploadIdByContentRef(scoped.content.contentId, auth);
    return { ok: true, uploadId, contentId: scoped.content.contentId };
  } catch {
    return {
      ok: false,
      observation: toolError('no_upload', 'No upload yet for this draft. Approve it first, or call publish_now (it will approve and publish).', {
        contentId: scoped.content.contentId,
      }),
    };
  }
}


export function createGetUploadTool(
  ruleId: string,
  workflowService: WorkflowService,
  contents: IContentRepository,
  contentService: ContentService,
  uploadService: UploadService,
  auth: TenancyAuth,
) {
  return tool(
    async ({ contentId, workflowId }) =>
      runTool(async () => {
        const scoped = await resolveContentForSession(
          workflowService,
          contents,
          ruleId,
          auth,
          { contentId, workflowId },
        );
        if (!scoped.ok) return scoped.observation;

        let uploadId: string;
        try {
          ({ uploadId } = await uploadService.findUploadIdByContentRef(
            scoped.content.contentId,
            auth,
          ));
        } catch {
          return toolError(
            'no_upload',
            'No upload yet for this draft. Approve it first, or call publish_now (it will approve and publish).',
            { contentId: scoped.content.contentId },
          );
        }
        const detail = await uploadService.findByUploadId(uploadId, auth);
        return toolOk({
          action: 'show_upload',
          uploadId: detail.uploadId,
          contentRef: detail.contentRef,
          status: detail.status,
          channels: detail.channels.map(channelView),
          issues: validateUploadDetail(detail).issues,
        });
      }),
    {
      name: 'get_upload',
      description:
        'Show the upload/publish draft for this content: per channel included flag, status, caption preview, mediaUrls, YouTube title, schedule, and any issues that would block publishing. Omit contentId for the latest post.',
      schema: z.object({
        contentId: CONTENT_ID_SCHEMA,
        workflowId: z.string().optional(),
      }),
    },
  );
}

export function createPublishNowTool(
  ruleId: string,
  workflowService: WorkflowService,
  contents: IContentRepository,
  contentService: ContentService,
  uploadService: UploadService,
  auth: TenancyAuth,
) {
  return tool(
    async ({ contentId, workflowId, channels }) =>
      runTool(async () => {
        const scoped = await resolveContentForSession(
          workflowService,
          contents,
          ruleId,
          auth,
          { contentId, workflowId },
        );
        if (!scoped.ok) return scoped.observation;

        const { uploadId } = await resolveUploadForContent(
          uploadService,
          contentService,
          scoped.content.contentId,
          auth,
        );
        const detail = await uploadService.findByUploadId(uploadId, auth);
        const channelDtos = channelIncludeList(detail.channels, channels);
        if (!channelDtos.some((c) => c.included)) {
          return toolError(
            'no_channels',
            'No channels selected to publish. Pass channels or include them on the upload.',
          );
        }
        const check = validateUploadDetail(detail, channelDtos);
        if (!check.ok) {
          return toolError(
            'upload_invalid',
            'Nothing was published. The upload is not ready: fix the issues first.',
            { uploadId, issues: check.issues },
          );
        }
        await uploadService.publishUpload(
          uploadId,
          {
            publishNow: true,
            scheduledAt: null,
            channels: channelDtos,
          },
          auth,
        );
        const updated = await contents.findById(scoped.content.contentId, auth);
        return showContentPayload(previewFromRecord(updated ?? scoped.content), {
          action: 'publish_started',
          uploadId,
          channels: channelDtos.filter((c) => c.included).map((c) => c.channel),
        });
      }),
    {
      name: 'publish_now',
      description:
        'Publish this draft to social now (approves first if still a draft). Confirm with ask_user first. Call check_channel_auth (or list_channels) before this; if a channel is not connected, call start_channel_oauth for it and wait, then check again. TikTok, YouTube and RedNote need media on the upload. Pass channels to limit which platforms. Stop after this tool.',
      schema: z.object({
        contentId: CONTENT_ID_SCHEMA,
        workflowId: z.string().optional(),
        channels: CHANNELS_SCHEMA,
      }),
    },
  );
}

export function createSchedulePublishTool(
  ruleId: string,
  workflowService: WorkflowService,
  contents: IContentRepository,
  contentService: ContentService,
  uploadService: UploadService,
  auth: TenancyAuth,
) {
  return tool(
    async ({ contentId, workflowId, channels, scheduledAt, timezone }) =>
      runTool(async () => {
        const scoped = await resolveContentForSession(
          workflowService,
          contents,
          ruleId,
          auth,
          { contentId, workflowId },
        );
        if (!scoped.ok) return scoped.observation;

        const when = scheduledAt?.trim();
        if (!when) {
          return toolError(
            'bad_request',
            'scheduledAt is required (ISO datetime in the future).',
          );
        }

        const { uploadId } = await resolveUploadForContent(
          uploadService,
          contentService,
          scoped.content.contentId,
          auth,
        );
        const detail = await uploadService.findByUploadId(uploadId, auth);
        const channelDtos = channelIncludeList(detail.channels, channels);
        if (!channelDtos.some((c) => c.included)) {
          return toolError(
            'no_channels',
            'No channels selected to schedule. Pass channels or include them on the upload.',
          );
        }
        const check = validateUploadDetail(detail, channelDtos);
        if (!check.ok) {
          return toolError(
            'upload_invalid',
            'Nothing was published. The upload is not ready: fix the issues first.',
            { uploadId, issues: check.issues },
          );
        }
        await uploadService.publishUpload(
          uploadId,
          {
            publishNow: false,
            scheduledAt: when,
            timezone: timezone?.trim() || null,
            channels: channelDtos,
          },
          auth,
        );
        return toolOk({
          action: 'scheduled',
          uploadId,
          scheduledAt: when,
          timezone: timezone?.trim() || null,
          channels: channelDtos.filter((c) => c.included).map((c) => c.channel),
        });
      }),
    {
      name: 'schedule_publish',
      description:
        'Schedule this draft for later (approves first if still a draft). Confirm with ask_user first. Check check_channel_auth first and connect with start_channel_oauth if needed, as for publish_now (TikTok, YouTube and RedNote need media). scheduledAt must be a future ISO datetime. Stop after this tool.',
      schema: z.object({
        contentId: CONTENT_ID_SCHEMA,
        workflowId: z.string().optional(),
        channels: CHANNELS_SCHEMA,
        scheduledAt: z
          .string()
          .describe('Future ISO datetime, e.g. 2026-11-04T10:00:00+07:00'),
        timezone: z
          .string()
          .optional()
          .describe('IANA timezone, e.g. Asia/Bangkok'),
      }),
    },
  );
}

/** Channel rows already handed to the platform: edit via reschedule/cancel, not a patch. */
const LOCKED_CHANNEL_STATUSES: ReadonlySet<string> = new Set([
  UploadChannelStatus.Publishing,
  UploadChannelStatus.Scheduled,
  UploadChannelStatus.Published,
]);
const MAX_MEDIA_PER_CHANNEL = 10;

export type ResolvedMedia = { assetId: string; url: string };
/** Looks up brand assets (chat attachments are brand assets too) by id. */
export type ResolveUploadMedia = (assetIds: string[]) => Promise<ResolvedMedia[]>;

function lockedRows(rows: ChannelRow[]): string[] {
  return rows.filter((c) => LOCKED_CHANNEL_STATUSES.has(String(c.status))).map((c) => c.channel);
}

const UPLOAD_SCOPE = {
  contentId: CONTENT_ID_SCHEMA,
  workflowId: z.string().optional(),
};

export function createAddUploadMediaTool(
  ruleId: string,
  workflowService: WorkflowService,
  contents: IContentRepository,
  uploadService: UploadService,
  auth: TenancyAuth,
  resolveMedia: ResolveUploadMedia,
) {
  return tool(
    async ({ contentId, workflowId, channels, assetIds }) =>
      runTool(async () => {
        const ids = [...new Set(assetIds.map((id) => id.trim()).filter(Boolean))];
        if (!ids.length) return toolError('bad_request', 'Pass at least one asset id (from list_brand_assets or an image attached in this chat).');
        const found = await existingUpload(ruleId, workflowService, contents, uploadService, auth, { contentId, workflowId });
        if (!found.ok) return found.observation;
        const media = await resolveMedia(ids);
        const missing = ids.filter((id) => !media.some((m) => m.assetId === id));
        if (missing.length) {
          return toolError('not_found', 'Unknown or not-ready asset ids. Use ids from list_brand_assets or chat attachments only.', { missing });
        }
        const detail = await uploadService.findByUploadId(found.uploadId, auth);
        const { rows, unknown } = pickChannels(detail, channels);
        if (unknown.length) return toolError('bad_request', `Not on this upload: ${unknown.join(', ')}.`, { available: detail.channels.map((c) => c.channel) });
        if (!rows.length) return toolError('no_channels', 'No channels selected. Pass channels or include them on the upload.');
        const locked = lockedRows(rows);
        if (locked.length) {
          return toolError('channel_locked', `Already scheduled or published: ${locked.join(', ')}. Cancel the schedule first to change media.`, { locked });
        }
        const updated: Array<{ channel: string; mediaUrls: string[] }> = [];
        for (const row of rows) {
          const merged = [...new Set([...channelMedia(row), ...media.map((m) => m.url)])];
          if (merged.length > MAX_MEDIA_PER_CHANNEL) {
            return toolError('bad_request', `At most ${MAX_MEDIA_PER_CHANNEL} media per channel (${row.channel} would have ${merged.length}).`);
          }
          await uploadService.patchUploadChannel(found.uploadId, row.channel, { mediaUrl: merged[0] ?? null, mediaUrls: merged }, auth);
          updated.push({ channel: row.channel, mediaUrls: merged });
        }
        return toolOk({ action: 'upload_media_added', uploadId: found.uploadId, added: media.map((m) => m.assetId), channels: updated });
      }),
    {
      name: 'add_upload_media',
      description:
        'Attach images/videos to the upload (publish draft) of this content. Sources: brand assets (list_brand_assets ids) or images attached in this chat ([[asset:...:id:...]] ids). Never pass a URL. Appends to existing media; omit channels for every included channel. Not for scheduled/published channels.',
      schema: z.object({
        ...UPLOAD_SCOPE,
        channels: CHANNELS_SCHEMA,
        assetIds: z.array(z.string().min(1)).min(1).max(MAX_MEDIA_PER_CHANNEL).describe('Brand asset ids to attach.'),
      }),
    },
  );
}

export function createRemoveUploadMediaTool(
  ruleId: string,
  workflowService: WorkflowService,
  contents: IContentRepository,
  uploadService: UploadService,
  auth: TenancyAuth,
) {
  return tool(
    async ({ contentId, workflowId, channels, mediaUrls, all }) =>
      runTool(async () => {
        const drop = new Set((mediaUrls ?? []).map((u) => u.trim()).filter(Boolean));
        if (!all && !drop.size) return toolError('bad_request', 'Pass mediaUrls (from get_upload) or all: true.');
        const found = await existingUpload(ruleId, workflowService, contents, uploadService, auth, { contentId, workflowId });
        if (!found.ok) return found.observation;
        const detail = await uploadService.findByUploadId(found.uploadId, auth);
        const { rows, unknown } = pickChannels(detail, channels);
        if (unknown.length) return toolError('bad_request', `Not on this upload: ${unknown.join(', ')}.`, { available: detail.channels.map((c) => c.channel) });
        const locked = lockedRows(rows);
        if (locked.length) {
          return toolError('channel_locked', `Already scheduled or published: ${locked.join(', ')}. Cancel the schedule first to change media.`, { locked });
        }
        const updated: Array<{ channel: string; removed: number; mediaUrls: string[] }> = [];
        for (const row of rows) {
          const before = channelMedia(row);
          const after = all ? [] : before.filter((u) => !drop.has(u));
          if (after.length === before.length) continue;
          await uploadService.patchUploadChannel(found.uploadId, row.channel, { mediaUrl: after[0] ?? null, mediaUrls: after }, auth);
          updated.push({ channel: row.channel, removed: before.length - after.length, mediaUrls: after });
        }
        if (!updated.length) return toolError('no_change', 'None of those media are on the selected channels. Call get_upload to see the current mediaUrls.');
        return toolOk({ action: 'upload_media_removed', uploadId: found.uploadId, channels: updated });
      }),
    {
      name: 'remove_upload_media',
      description:
        'Remove images/videos from the upload of this content (mediaUrls from get_upload, or all: true). Confirm with ask_user first. Omit channels for every included channel. Does not delete the brand asset itself.',
      schema: z.object({
        ...UPLOAD_SCOPE,
        channels: CHANNELS_SCHEMA,
        mediaUrls: z.array(z.string().min(1)).optional(),
        all: z.boolean().optional().describe('true removes every media item on the selected channels.'),
      }),
    },
  );
}

export function createEditUploadChannelTool(
  ruleId: string,
  workflowService: WorkflowService,
  contents: IContentRepository,
  uploadService: UploadService,
  auth: TenancyAuth,
) {
  return tool(
    async ({ contentId, workflowId, channel, included, caption, youtubeTitle }) =>
      runTool(async () => {
        if (included === undefined && caption === undefined && youtubeTitle === undefined) {
          return toolError('bad_request', 'Pass at least one of included, caption, youtubeTitle. For media use add_upload_media / remove_upload_media.');
        }
        const found = await existingUpload(ruleId, workflowService, contents, uploadService, auth, { contentId, workflowId });
        if (!found.ok) return found.observation;
        const detail = await uploadService.findByUploadId(found.uploadId, auth);
        const { rows, unknown } = pickChannels(detail, [channel]);
        if (unknown.length || !rows[0]) return toolError('bad_request', `Not on this upload: ${channel}.`, { available: detail.channels.map((c) => c.channel) });
        const row = rows[0];
        if (LOCKED_CHANNEL_STATUSES.has(String(row.status))) {
          return toolError('channel_locked', `${row.channel} is already ${row.status}. Use reschedule_publish to change a scheduled post, or cancel_schedule first.`, { status: row.status });
        }
        if (youtubeTitle !== undefined && normalizeChannelId(row.channel) !== 'youtube') {
          return toolError('bad_request', 'youtubeTitle only applies to the YouTube channel.');
        }
        await uploadService.patchUploadChannel(
          found.uploadId,
          row.channel,
          {
            ...(included !== undefined ? { included } : {}),
            ...(caption !== undefined ? { caption } : {}),
            ...(youtubeTitle !== undefined ? { youtubeTitle } : {}),
          },
          auth,
        );
        const after = await uploadService.findByUploadId(found.uploadId, auth);
        const updated = after.channels.find((c) => c.channel === row.channel) ?? row;
        return toolOk({ action: 'upload_channel_updated', uploadId: found.uploadId, channel: channelView(updated) });
      }),
    {
      name: 'edit_upload_channel',
      description:
        'Change one channel on the publish draft: include/exclude it, replace its caption with text the user gave, or set the YouTube title. Only for channels not yet scheduled/published. To change the draft text itself use edit_content; media: add_upload_media / remove_upload_media.',
      schema: z.object({
        ...UPLOAD_SCOPE,
        channel: z.string().min(1).describe('Channel id, e.g. instagram.'),
        included: z.boolean().optional(),
        caption: z.string().optional().describe('Exact caption for this channel (user-provided wording).'),
        youtubeTitle: z.string().max(100).optional(),
      }),
    },
  );
}

export function createPreviewUploadTool(
  ruleId: string,
  workflowService: WorkflowService,
  contents: IContentRepository,
  uploadService: UploadService,
  auth: TenancyAuth,
) {
  return tool(
    async ({ contentId, workflowId, channels }) =>
      runTool(async () => {
        const found = await existingUpload(ruleId, workflowService, contents, uploadService, auth, { contentId, workflowId });
        if (!found.ok) return found.observation;
        const detail = await uploadService.findByUploadId(found.uploadId, auth);
        const include = channels?.length ? channelIncludeList(detail.channels, channels) : undefined;
        const check = validateUploadDetail(detail, include);
        const { rows } = pickChannels(detail, channels);
        const connectedSet =
          typeof uploadService.getConnectedChannels === 'function'
            ? await uploadService.getConnectedChannels(auth.userId).catch(() => null)
            : null;
        const issues = [...check.issues];
        const notConnected: string[] = [];
        if (connectedSet) {
          for (const row of rows) {
            const key = row.channel.trim().toLowerCase();
            if (!connectedSet.has(key)) {
              notConnected.push(row.channel);
              issues.push({
                channel: row.channel,
                problem: `${row.channel} is not connected. Call start_channel_oauth to connect it.`,
              });
            }
          }
        }
        return toolOk({
          action: 'upload_preview',
          uploadId: found.uploadId,
          ready: check.ok && notConnected.length === 0,
          issues,
          channels: rows.map((r) => ({
            ...channelView(r),
            connected: connectedSet ? connectedSet.has(r.channel.trim().toLowerCase()) : undefined,
          })),
          ...(notConnected.length > 0
            ? {
                notConnected,
                next: `Call start_channel_oauth for ${notConnected[0]} to show the Connect button in chat.`,
              }
            : {}),
        });
      }),
    {
      name: 'preview_upload',
      description:
        'Read-only pre-publish check: shows what each channel will post (caption preview, media, YouTube title) and lists issues (or missing account connections) that would block publishing. Changes nothing.',
      schema: z.object({ ...UPLOAD_SCOPE, channels: CHANNELS_SCHEMA }),
    },
  );
}

export function createReschedulePublishTool(
  ruleId: string,
  workflowService: WorkflowService,
  contents: IContentRepository,
  uploadService: UploadService,
  auth: TenancyAuth,
) {
  return tool(
    async ({ contentId, workflowId, channel, scheduledAt, timezone }) =>
      runTool(async () => {
        const when = scheduledAt?.trim();
        if (!when) return toolError('bad_request', 'scheduledAt is required (ISO datetime in the future).');
        const found = await existingUpload(ruleId, workflowService, contents, uploadService, auth, { contentId, workflowId });
        if (!found.ok) return found.observation;
        await uploadService.updateUpload(
          found.uploadId,
          { scheduledAt: when, timezone: timezone?.trim() || null, ...(channel?.trim() ? { channel: channel.trim() } : {}) },
          auth,
        );
        return toolOk({ action: 'rescheduled', uploadId: found.uploadId, scheduledAt: when, timezone: timezone?.trim() || null, channel: channel?.trim() || null });
      }),
    {
      name: 'reschedule_publish',
      description:
        'Move an already scheduled post to a new future time. Confirm with ask_user first. Omit channel to move every scheduled channel. For a draft that is not scheduled yet use schedule_publish.',
      schema: z.object({
        ...UPLOAD_SCOPE,
        channel: z.string().optional(),
        scheduledAt: z.string().describe('Future ISO datetime, e.g. 2026-11-04T10:00:00+07:00'),
        timezone: z.string().optional().describe('IANA timezone, e.g. Asia/Bangkok'),
      }),
    },
  );
}

export function createCancelScheduleTool(
  ruleId: string,
  workflowService: WorkflowService,
  contents: IContentRepository,
  uploadService: UploadService,
  postService: PostService,
  auth: TenancyAuth,
) {
  return tool(
    async ({ contentId, workflowId }) =>
      runTool(async () => {
        const found = await existingUpload(ruleId, workflowService, contents, uploadService, auth, { contentId, workflowId });
        if (!found.ok) return found.observation;
        // Only still-scheduled posts: deletePost on a published post would unpublish it.
        const scheduled = (await postService.findScheduledPostsForUpload(found.uploadId)).filter(
          (p) => String(p.status) === String(PostStatus.Scheduled),
        );
        if (!scheduled.length) return toolError('no_change', 'Nothing is scheduled for this post.');
        const cancelled: string[] = [];
        for (const p of scheduled) {
          await postService.deletePost(p.postId, auth);
          cancelled.push(p.postId);
        }
        return toolOk({ action: 'schedule_cancelled', uploadId: found.uploadId, cancelledPostIds: cancelled, note: 'The draft is back to pending; it can be scheduled or published again.' });
      }),
    {
      name: 'cancel_schedule',
      description:
        'Cancel the scheduled (not yet published) post for this content; the draft stays and can be scheduled again. Confirm with ask_user first. Never unpublishes a live post.',
      schema: z.object(UPLOAD_SCOPE),
    },
  );
}

export function createRetryPublishTool(
  ruleId: string,
  workflowService: WorkflowService,
  contents: IContentRepository,
  uploadService: UploadService,
  postService: PostService,
  auth: TenancyAuth,
) {
  return tool(
    async ({ contentId, uploadId, postId, workflowId }) =>
      runTool(async () => {
        const pid = postId?.trim();
        if (pid) {
          const result = await postService.retryPost(pid, auth);
          return toolOk({ action: 'post_retry_started', oldPostId: pid, newPostId: result.newPostId });
        }
        let id = uploadId?.trim();
        if (!id) {
          const found = await existingUpload(ruleId, workflowService, contents, uploadService, auth, { contentId, workflowId });
          if (!found.ok) return found.observation;
          id = found.uploadId;
        }
        const detail = await uploadService.findByUploadId(id, auth);
        const failed = detail.channels.filter((c) => String(c.status) === UploadChannelStatus.Failed).map((c) => c.channel);
        if (!failed.length) return toolError('no_change', 'No failed channel on this upload; nothing to retry.');
        await uploadService.retryUpload(id, auth);
        return toolOk({ action: 'upload_retry_started', uploadId: id, channels: failed });
      }),
    {
      name: 'retry_publish',
      description:
        'Retry a failed publish. Pass postId (from list_posts, status failed) to retry that post, or omit it to retry the failed channels on the latest content upload (or uploadId). Confirm with ask_user first.',
      schema: z.object({
        contentId: CONTENT_ID_SCHEMA,
        uploadId: z.string().optional(),
        postId: z.string().optional(),
        workflowId: z.string().optional(),
      }),
    },
  );
}
