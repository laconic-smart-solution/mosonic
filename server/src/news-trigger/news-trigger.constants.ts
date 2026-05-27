export const NEWS_TRIGGER_QUEUE = 'news_trigger';

export const NEWS_TRIGGER_JOB_PROCESS_GROUP = 'process_news_group';
export const NEWS_TRIGGER_JOB_PROCESS_SINGLE = 'process_single_rule';

/** One Bull job per manual run (BullMQ custom ids must not contain `:`). */
export function newsTriggerManualJobId(ruleId: string, runId: string): string {
  return `news-trigger-manual-${ruleId}-${runId}`;
}
