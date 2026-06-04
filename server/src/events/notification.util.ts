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
  const href =
    ruleRef?.trim()
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
  const href = ruleRef?.trim()
    ? `/workflow/${ruleRef.trim()}`
    : '/workflows';
  return {
    title: 'Workflow ready',
    message: 'AI generated your workflow structure.',
    data: { workflowId, ruleRef: ruleRef ?? undefined },
    action: { label: 'Open workflow', href },
  };
}
