import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { TenancyAuth } from '../../auth/tenancy.types';
import { PrismaService } from '../../database/prisma.service';
import type {
  IRuleMemoryRepository,
  RuleMemoryRecord,
} from '../interfaces/rule-memory.repository.interface';
import { mergeTenancyWhere } from './prisma.util';

@Injectable()
export class PrismaRuleMemoryRepository implements IRuleMemoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(
    ruleMemoryId: string,
    auth?: TenancyAuth,
  ): Promise<RuleMemoryRecord | null> {
    const where = auth
      ? mergeTenancyWhere({ ruleMemoryId }, auth)
      : { ruleMemoryId };
    return this.prisma.ruleMemory.findFirst({ where });
  }

  findByRuleId(
    ruleId: string,
    auth?: TenancyAuth,
    limit?: number,
  ): Promise<RuleMemoryRecord[]> {
    const where = auth ? mergeTenancyWhere({ ruleId }, auth) : { ruleId };
    return this.prisma.ruleMemory.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...(limit ? { take: limit } : {}),
    });
  }

  create(data: Prisma.RuleMemoryCreateInput): Promise<RuleMemoryRecord> {
    return this.prisma.ruleMemory.create({ data });
  }

  async deleteById(ruleMemoryId: string, auth?: TenancyAuth): Promise<boolean> {
    const where = auth
      ? mergeTenancyWhere({ ruleMemoryId }, auth)
      : { ruleMemoryId };
    const existing = await this.prisma.ruleMemory.findFirst({ where });
    if (!existing) return false;
    await this.prisma.ruleMemory.delete({ where: { ruleMemoryId } });
    return true;
  }
}
