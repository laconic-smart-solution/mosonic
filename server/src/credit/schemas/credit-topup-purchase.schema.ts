export { CreditTopupPurchaseStatus } from '@prisma/client';

import type { CreditTopupPurchaseStatus } from '@prisma/client';

export interface CreditTopupPurchase {
  topupPurchaseId: string;
  userId: string;
  packageId: string;
  credits: number;
  amount: number;
  currencyCode: string;
  transactionId: string;
  status: CreditTopupPurchaseStatus;
  purchaseDate: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type CreditTopupPurchaseDocument = CreditTopupPurchase;
