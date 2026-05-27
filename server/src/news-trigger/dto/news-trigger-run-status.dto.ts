import type {
  NewsTriggerRunOutcome,
  NewsTriggerRunStatus,
} from '../news-trigger-run-summary.util';

export class NewsTriggerRunStatusDto {
  runId!: string;
  status!: NewsTriggerRunStatus;
  outcome?: NewsTriggerRunOutcome;
  message!: string;
  articlesFetched?: number;
  pipelinesTriggered?: number;
  articleTitle?: string;
  relevanceScore?: number;
  pipelineId?: string;
  skipReason?: string;
  completedAt?: string;
}
