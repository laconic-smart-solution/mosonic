import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { FixedCostRecord } from '../../domain/credit/credit.types';
import type { IFixedCostRepository } from '../interfaces/fixed-cost.repository.interface';

@Injectable()
export class PrismaFixedCostRepository implements IFixedCostRepository {
  constructor(private readonly prisma: PrismaService) {}

  count(): Promise<number> {
    return this.prisma.fixedCost.count();
  }

  insertMany(data: Prisma.FixedCostCreateManyInput[]): Promise<void> {
    return this.prisma.fixedCost.createMany({ data }).then(() => undefined);
  }

  listAllSorted(): Promise<FixedCostRecord[]> {
    return this.prisma.fixedCost.findMany({ orderBy: { name: 'asc' } });
  }

  listActive(): Promise<FixedCostRecord[]> {
    return this.prisma.fixedCost.findMany({ where: { isActive: true } });
  }

  create(data: Prisma.FixedCostCreateInput): Promise<FixedCostRecord> {
    return this.prisma.fixedCost.create({ data });
  }

  async updateById(
    fixedCostId: string,
    data: Prisma.FixedCostUpdateInput,
  ): Promise<FixedCostRecord | null> {
    try {
      return await this.prisma.fixedCost.update({
        where: { fixedCostId },
        data,
      });
    } catch {
      return null;
    }
  }
}
