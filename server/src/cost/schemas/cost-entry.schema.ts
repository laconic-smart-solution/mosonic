export { CostEntryType } from '@prisma/client';

import type { CostEntryType } from '@prisma/client';

export const COST_ENTRY_TYPES: CostEntryType[] = [
  'openai_llm',
  'openai_image',
  'openai_video',
  'zernio_account',
];

export interface CostEntry {
  userId: string;
  pipelineRef: string;
  campaignRef: string;
  contentRef?: string;
  nodeId?: string;
  nodeType?: string;
  provider: string;
  providerModel?: string;
  entryType: CostEntryType;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  imageCount: number;
  imageSize?: string;
  imageQuality?: string;
  videoSeconds: number;
  videoResolution?: string;
  accountCount: number;
  costUsd: number;
  billingPeriod: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type CostEntryDocument = CostEntry;
