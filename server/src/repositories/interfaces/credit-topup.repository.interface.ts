import type { Prisma } from '@prisma/client';
import type { CreditTopupRecord } from '../../domain/credit/credit.types';

export interface ICreditTopupRepository {
  create(data: Prisma.CreditTopupCreateInput): Promise<CreditTopupRecord>;
}
