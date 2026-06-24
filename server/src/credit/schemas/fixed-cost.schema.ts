export interface FixedCost {
  fixedCostId: string;
  name: string;
  amountUsd: number;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export type FixedCostDocument = FixedCost;
