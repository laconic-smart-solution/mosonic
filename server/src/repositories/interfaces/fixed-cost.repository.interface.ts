import type { Prisma } from '@prisma/client';
import type { FixedCostRecord } from '../../domain/credit/credit.types';

export interface IFixedCostRepository {
  count(): Promise<number>;
  insertMany(data: Prisma.FixedCostCreateManyInput[]): Promise<void>;
  listAllSorted(): Promise<FixedCostRecord[]>;
  listActive(): Promise<FixedCostRecord[]>;
  create(data: Prisma.FixedCostCreateInput): Promise<FixedCostRecord>;
  updateById(
    fixedCostId: string,
    data: Prisma.FixedCostUpdateInput,
  ): Promise<FixedCostRecord | null>;
}
