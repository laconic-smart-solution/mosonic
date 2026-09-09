import type { NotificationAction } from './notification.types';

export function userRoom(userId: string): string {
  return `user:${userId}`;
}

export function isUserScopedRoom(room: string): boolean {
  return room.startsWith('user:');
}

export function pipelineStartedNotification(args: {
  pipelineId: string;
  ruleRef?: string;
  workflowRef?: string;
  totalNodes: number;
}): {
  title: string;
  message: string;
  data: Record<string, unknown>;
  action?: NotificationAction;
} {
  const { pipelineId, ruleRef, workflowRef, totalNodes } = args;
  const href = ruleRef?.trim()
    ? `/workflow/${ruleRef.trim()}?pipelineId=${pipelineId}`
    : `/pipelines`;
  return {
    title: 'Pipeline started',
    message: `Running ${totalNodes} node${totalNodes === 1 ? '' : 's'}…`,
    data: {
      pipelineId,
      ruleRef: ruleRef ?? undefined,
      workflowRef: workflowRef ?? undefined,
      totalNodes,
    },
    action: { label: 'View run', href },
  };
}

export function pipelineCompletedNotification(args: {
  pipelineId: string;
  contentId: string;
  uploadId?: string;
  ruleRef?: string;
  workflowRef?: string;
}): {
  title: string;
  message: string;
  data: Record<string, unknown>;
  action?: NotificationAction;
} {
  const { pipelineId, contentId, uploadId, ruleRef, workflowRef } = args;
  const href = uploadId?.trim()
    ? `/upload/${uploadId.trim()}`
    : `/content/${contentId}`;
  return {
    title: 'Pipeline complete',
    message: 'Your content is ready to review.',
    data: {
      pipelineId,
      contentId,
      uploadId: uploadId ?? undefined,
      ruleRef: ruleRef ?? undefined,
      workflowRef: workflowRef ?? undefined,
    },
    action: { label: 'Open content', href },
  };
}

export function pipelineFailedNotification(args: {
  pipelineId: string;
  message: string;
  reason?: string;
  ruleRef?: string;
}): {
  title: string;
  message: string;
  data: Record<string, unknown>;
  action?: NotificationAction;
} {
  const { pipelineId, message, reason, ruleRef } = args;
  const href = ruleRef?.trim()
    ? `/workflow/${ruleRef.trim()}?pipelineId=${pipelineId}`
    : `/pipelines`;
  const isCancelled = reason === 'cancelled';
  return {
    title: isCancelled ? 'Pipeline stopped' : 'Pipeline failed',
    message: message.trim() || 'Your pipeline could not be completed.',
    data: {
      pipelineId,
      reason: reason ?? undefined,
      ruleRef: ruleRef ?? undefined,
    },
    action: { label: 'View run', href },
  };
}

export function newsPipelineStartedNotification(args: {
  pipelineId: string;
  ruleRef: string;
  newsTitle: string;
  newsUrl?: string;
  relevanceScore?: number;
}): {
  title: string;
  message: string;
  data: Record<string, unknown>;
  action?: NotificationAction;
} {
  const titleShort = args.newsTitle.slice(0, 60);
  const href = `/workflow/${args.ruleRef}?pipelineId=${args.pipelineId}`;
  return {
    title: 'News content generating',
    message: `Draft started from: "${titleShort}"`,
    data: {
      pipelineId: args.pipelineId,
      ruleRef: args.ruleRef,
      newsTitle: args.newsTitle,
      newsUrl: args.newsUrl,
      relevanceScore: args.relevanceScore,
    },
    action: { label: 'View run', href },
  };
}

export function newsRunCompletedNotification(args: {
  runId: string;
  ruleRef: string;
  outcome: 'triggered' | 'skipped';
  message: string;
  pipelineId?: string;
  articleTitle?: string;
}): {
  title: string;
  message: string;
  data: Record<string, unknown>;
  action?: NotificationAction;
} {
  const title =
    args.outcome === 'triggered'
      ? 'News run started generation'
      : 'News run completed';

  const data: Record<string, unknown> = {
    runId: args.runId,
    ruleRef: args.ruleRef,
    outcome: args.outcome,
  };
  if (args.pipelineId) data.pipelineId = args.pipelineId;
  if (args.articleTitle) data.articleTitle = args.articleTitle;

  const action =
    args.outcome === 'triggered' && args.pipelineId
      ? {
          label: 'View generation',
          href: `/workflow/${args.ruleRef}?pipelineId=${args.pipelineId}`,
        }
      : undefined;

  return {
    title,
    message: args.message,
    data,
    action,
  };
}

export function newsContentReadyNotification(args: {
  pipelineId: string;
  contentId: string;
  ruleRef: string;
  newsTitle: string;
  newsUrl?: string;
}): {
  title: string;
  message: string;
  data: Record<string, unknown>;
  action?: NotificationAction;
} {
  const titleShort = args.newsTitle.slice(0, 60);
  return {
    title: 'News content ready',
    message: `Draft ready from: "${titleShort}"`,
    data: {
      pipelineId: args.pipelineId,
      contentId: args.contentId,
      ruleRef: args.ruleRef,
      newsTitle: args.newsTitle,
      newsUrl: args.newsUrl,
    },
    action: { label: 'Review draft', href: `/content/${args.contentId}` },
  };
}

export function adminAnnouncementNotification(args: {
  announcementId: string;
  title: string;
  message: string;
  level?: string;
}): {
  title: string;
  message: string;
  data: Record<string, unknown>;
  action?: NotificationAction;
} {
  return {
    title: args.title,
    message: args.message,
    data: {
      announcementId: args.announcementId,
      level: args.level ?? 'info',
    },
    action: { label: 'View announcements', href: '/announcements' },
  };
}

export function workflowCompletedNotification(args: {
  workflowId: string;
  ruleRef?: string;
}): {
  title: string;
  message: string;
  data: Record<string, unknown>;
  action?: NotificationAction;
} {
  const { workflowId, ruleRef } = args;
  const href = ruleRef?.trim() ? `/workflow/${ruleRef.trim()}` : '/workflows';
  return {
    title: 'Workflow ready',
    message: 'AI generated your workflow structure.',
    data: { workflowId, ruleRef: ruleRef ?? undefined },
    action: { label: 'Open workflow', href },
  };
}

export function pipelineNodeReviewNotification(args: {
  pipelineId: string;
  nodeId: string;
  nodeType: string;
  ruleRef?: string;
  lane?: string | null;
}): {
  title: string;
  message: string;
  data: Record<string, unknown>;
  action?: NotificationAction;
} {
  const href = args.ruleRef?.trim()
    ? `/workflow/${args.ruleRef.trim()}?pipelineId=${args.pipelineId}`
    : `/pipelines`;
  const laneLabel = args.lane?.trim() ? ` (${args.lane})` : '';
  return {
    title: 'Pipeline step needs review',
    message: `Review ${args.nodeType.replace(/_/g, ' ')}${laneLabel} before continuing.`,
    data: {
      pipelineId: args.pipelineId,
      nodeId: args.nodeId,
      nodeType: args.nodeType,
      ruleRef: args.ruleRef,
      lane: args.lane ?? null,
    },
    action: { label: 'Review step', href },
  };
}

function formatChannels(channels: string[] | undefined | null): string {
  const list = (channels ?? []).map((c) => c.trim()).filter(Boolean);
  return list.length > 0 ? list.join(', ') : 'your connected channels';
}

/** Format an instant in the given IANA timezone (falls back to UTC). */
export function formatScheduleInstant(
  iso: string,
  timezone?: string | null,
): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const tz = timezone?.trim() || 'UTC';
  try {
    const formatted = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZoneName: 'short',
    }).format(d);
    return formatted.replace(',', '');
  } catch {
    return d
      .toISOString()
      .replace('T', ' ')
      .replace(/\.\d{3}Z$/, ' UTC');
  }
}

/** Replace `{channels}`, `{uploadId}`, `{postId}`, `{scheduledAt}` in notify templates. */
export function renderNotifyTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
    return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : '';
  });
}

/** Confirmed local schedule (Mosonic / Zernio). */
export function postScheduledNotification(args: {
  uploadId: string;
  scheduledAt: string;
  channels?: string[] | null;
  /** IANA timezone for display (e.g. Asia/Bangkok). */
  timezone?: string | null;
}): {
  title: string;
  message: string;
  data: Record<string, unknown>;
  action?: NotificationAction;
} {
  const tz = args.timezone?.trim() || 'UTC';
  return {
    title: 'Post scheduled',
    message: `Your post is scheduled for ${formatScheduleInstant(args.scheduledAt, tz)} on ${formatChannels(args.channels)}.`,
    data: {
      uploadId: args.uploadId,
      scheduledAt: args.scheduledAt,
      timezone: tz,
      channels: args.channels ?? [],
    },
    action: { label: 'View upload', href: `/upload/${args.uploadId}` },
  };
}

/** Scheduler fired — publish request sent to Zernio. */
export function postPublishingNowNotification(args: {
  uploadId: string;
  postId: string;
  channels?: string[] | null;
}): {
  title: string;
  message: string;
  data: Record<string, unknown>;
  action?: NotificationAction;
} {
  return {
    title: 'Publishing now',
    message: `Your scheduled post is publishing now to ${formatChannels(args.channels)}.`,
    data: {
      uploadId: args.uploadId,
      postId: args.postId,
      channels: args.channels ?? [],
    },
    action: { label: 'View upload', href: `/upload/${args.uploadId}` },
  };
}

/** Post reached Published (webhook or Zernio sync). */
export function postPublishedNotification(args: {
  uploadId?: string | null;
  postId: string;
  channels?: string[] | null;
  /** Optional env override for title; supports `{channels}`, `{uploadId}`, `{postId}`. */
  titleTemplate?: string | null;
  /** Optional env override for message; supports `{channels}`, `{uploadId}`, `{postId}`. */
  messageTemplate?: string | null;
}): {
  title: string;
  message: string;
  data: Record<string, unknown>;
  action?: NotificationAction;
} {
  const uploadId = args.uploadId?.trim() || undefined;
  const channelsLabel = formatChannels(args.channels);
  const vars = {
    channels: channelsLabel,
    uploadId: uploadId ?? '',
    postId: args.postId,
  };
  const title = args.titleTemplate?.trim()
    ? renderNotifyTemplate(args.titleTemplate.trim(), vars)
    : 'Post published';
  const message = args.messageTemplate?.trim()
    ? renderNotifyTemplate(args.messageTemplate.trim(), vars)
    : `Your post was published to ${channelsLabel}.`;
  return {
    title,
    message,
    data: {
      uploadId,
      postId: args.postId,
      channels: args.channels ?? [],
    },
    action: {
      label: 'View upload',
      href: uploadId ? `/upload/${uploadId}` : '/upload',
    },
  };
}
