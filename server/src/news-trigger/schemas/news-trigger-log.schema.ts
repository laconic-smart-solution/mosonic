export interface NewsTriggerLogDetail {
  ruleId: string;
  userId: string;
  articleTitle: string;
  relevanceScore?: number;
  pipelineId?: string;
  triggered: boolean;
  skipReason?: string;
}

export interface NewsTriggerLog {
  runId: string;
  group: string;
  ruleId: string | null;
  ranAt: Date;
  completedAt: Date | null;
  articlesFetched: number;
  topArticlesPicked: number;
  rulesChecked: number;
  rulesMatched: number;
  pipelinesTriggered: number;
  details: NewsTriggerLogDetail[];
  errorMessage: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type NewsTriggerLogDocument = NewsTriggerLog;
