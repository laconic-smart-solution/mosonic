import type {
  CreditConfig,
  CreditLedger,
  CreditTopup,
  CreditTopupPurchase,
  FixedCost,
  NodeCreditPrice,
  ServiceRate,
} from '@prisma/client';

export type CreditConfigRecord = CreditConfig;
export type FixedCostRecord = FixedCost;
export type ServiceRateRecord = ServiceRate;
export type NodeCreditPriceRecord = NodeCreditPrice;
export type CreditLedgerRecord = CreditLedger;
export type CreditTopupRecord = CreditTopup;
export type CreditTopupPurchaseRecord = CreditTopupPurchase;

export type CreditConfigChangeHistoryEntry = {
  creditPriceUsd: number;
  marginTarget: number;
  basicUsersPerMonth: number;
  overheadFactor: number;
  changedAt: Date;
  changedBy: string;
};
