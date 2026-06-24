import { CampaignContentPromptStrategy as PrismaCampaignContentPromptStrategy } from '@prisma/client';

export const ContentPromptStrategy = {
  ...PrismaCampaignContentPromptStrategy,
  Fixed: PrismaCampaignContentPromptStrategy.fixed,
  Rotate: PrismaCampaignContentPromptStrategy.rotate,
  AiCalendar: PrismaCampaignContentPromptStrategy.ai_calendar,
} as const;

export type ContentPromptStrategy =
  (typeof ContentPromptStrategy)[keyof typeof ContentPromptStrategy];

export interface CampaignSchedule {
  scheduleId: string;
  userId: string;
  ruleRef: string;
  workflowTemplateId: string | null;
  workflowRef: string | null;
  contentPromptStrategy: ContentPromptStrategy;
  contentPrompts: string[];
  timezone: string;
  enabled: boolean;
  nextRunAt: Date;
  lastRunAt: Date | null;
  lastPipelineId: string | null;
  failureCount: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export type CampaignScheduleDocument = CampaignSchedule;
