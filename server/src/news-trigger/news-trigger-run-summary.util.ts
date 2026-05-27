import type { NewsTriggerLogDetail } from './schemas/news-trigger-log.schema';

export type NewsTriggerRunOutcome = 'triggered' | 'skipped';
export type NewsTriggerRunStatus = 'running' | 'completed' | 'failed';

export type NewsTriggerRunStatusDto = {
  runId: string;
  status: NewsTriggerRunStatus;
  outcome?: NewsTriggerRunOutcome;
  message: string;
  articlesFetched?: number;
  pipelinesTriggered?: number;
  articleTitle?: string;
  relevanceScore?: number;
  pipelineId?: string;
  skipReason?: string;
  completedAt?: string;
};

export type NewsTriggerLogLike = {
  runId: string;
  completedAt?: Date | null;
  errorMessage?: string | null;
  articlesFetched?: number;
  pipelinesTriggered?: number;
  details?: NewsTriggerLogDetail[];
};

export function manualRunGroupKey(ruleId: string): string {
  return `manual:${ruleId}`;
}

function triggeredDetail(
  details: NewsTriggerLogDetail[] | undefined,
): NewsTriggerLogDetail | undefined {
  return details?.find((d) => d.triggered);
}

function firstSkipDetail(
  details: NewsTriggerLogDetail[] | undefined,
): NewsTriggerLogDetail | undefined {
  return details?.find((d) => !d.triggered && d.skipReason);
}

export function skipReasonToMessage(
  reason: string | undefined,
  articlesFetched?: number,
): string {
  if (!reason) {
    if (articlesFetched === 0) {
      return 'No matching news articles were found for your filters.';
    }
    return 'No suitable article matched your campaign settings.';
  }

  const r = reason.toLowerCase();
  if (r.includes('keyword pre-filter')) {
    return 'No article contained your required keywords.';
  }
  if (r.includes('max posts per day')) {
    return 'Daily news post limit reached for this campaign.';
  }
  if (r.includes('max concurrent')) {
    return 'Too many pipelines are running. Try again shortly.';
  }
  if (r.includes('below threshold') || r.includes('score')) {
    return 'Headlines did not meet your minimum relevance score.';
  }
  if (r.includes('no ready workflow')) {
    return 'No ready workflow found for this campaign.';
  }
  if (r.includes('no articles') || articlesFetched === 0) {
    return 'No matching news articles were found for your filters.';
  }

  return reason;
}

export function summarizeNewsTriggerLog(
  log: NewsTriggerLogLike,
  ruleId: string,
): NewsTriggerRunStatusDto {
  const base = {
    runId: log.runId,
    articlesFetched: log.articlesFetched,
    pipelinesTriggered: log.pipelinesTriggered,
  };

  if (!log.completedAt) {
    return {
      ...base,
      status: 'running',
      message: 'Checking news and evaluating headlines…',
    };
  }

  const completedAt =
    log.completedAt instanceof Date
      ? log.completedAt.toISOString()
      : String(log.completedAt);

  if (log.errorMessage?.trim()) {
    return {
      ...base,
      status: 'failed',
      message: log.errorMessage.trim(),
      completedAt,
    };
  }

  const triggered = triggeredDetail(log.details);
  if ((log.pipelinesTriggered ?? 0) > 0 && triggered) {
    const titleShort = triggered.articleTitle.slice(0, 80);
    return {
      ...base,
      status: 'completed',
      outcome: 'triggered',
      message: `Generation started from "${titleShort}"`,
      articleTitle: triggered.articleTitle,
      relevanceScore: triggered.relevanceScore,
      pipelineId: triggered.pipelineId,
      completedAt,
    };
  }

  const skip = firstSkipDetail(log.details);
  const skipReason = skip?.skipReason;
  return {
    ...base,
    status: 'completed',
    outcome: 'skipped',
    message: skipReasonToMessage(skipReason, log.articlesFetched),
    skipReason,
    articleTitle: skip?.articleTitle,
    relevanceScore: skip?.relevanceScore,
    completedAt,
  };
}

export function pendingRunStatus(runId: string): NewsTriggerRunStatusDto {
  return {
    runId,
    status: 'running',
    message: 'News check queued…',
  };
}
