export interface CreditConfigHistoryEntry {
  creditPriceUsd: number;
  marginTarget: number;
  basicUsersPerMonth: number;
  overheadFactor: number;
  changedAt: Date;
  changedBy: string;
}

export interface CreditConfig {
  singletonKey: string;
  creditPriceUsd: number;
  marginTarget: number;
  basicUsersPerMonth: number;
  overheadFactor: number;
  derivedMargin: number;
  changeHistory: CreditConfigHistoryEntry[];
  createdAt?: Date;
  updatedAt?: Date;
}

export type CreditConfigDocument = CreditConfig;
