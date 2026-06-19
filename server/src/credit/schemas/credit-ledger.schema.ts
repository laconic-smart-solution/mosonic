export interface CreditLedger {
  userId: string;
  pipelineRef: string;
  campaignRef?: string;
  contentRef?: string;
  nodeId: string;
  nodeType: string;
  provider: string;
  model: string;
  rawCostUsd: number;
  overheadUsd: number;
  marginAppliedUsd: number;
  creditPriceUsdSnapshot: number;
  creditsCharged: number;
  billingPeriod: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type CreditLedgerDocument = CreditLedger;
