export type DeductCreditsDto = {
  userId: string;
  pipelineRef: string;
  campaignRef?: string;
  contentRef?: string;
  nodeId: string;
  nodeType: string;
  provider: string;
  model?: string;
  rawCostUsd: number;
  billingPeriod: Date;
};
