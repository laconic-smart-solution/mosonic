export interface NodeCreditPrice {
  nodeCreditPriceId: string;
  nodeType: string;
  costUsd: number;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export type NodeCreditPriceDocument = NodeCreditPrice;
