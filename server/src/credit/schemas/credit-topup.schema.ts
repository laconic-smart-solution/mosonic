export { CreditTopupSource } from '@prisma/client';

import type { CreditTopupSource } from '@prisma/client';

export interface CreditTopup {
  userId: string;
  packageId?: string;
  credits: number;
  priceUsd: number;
  source: CreditTopupSource;
  adminUserId?: string;
  reason?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type CreditTopupDocument = CreditTopup;
