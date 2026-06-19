import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { TenancyAuth } from '../../auth/tenancy.types';
import { PrismaService } from '../../database/prisma.service';
import type { IRuleRepository, RuleRecord } from '../interfaces/rule.repository.interface';
import { mergeTenancyWhere } from './prisma.util';

@Injectable()
export class PrismaRuleRepository implements IRuleRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(ruleId: string, auth?: TenancyAuth): Promise<RuleRecord | null> {
    const where = auth ? mergeTenancyWhere({ ruleId }, auth) : { ruleId };
    return this.prisma.rule.findFirst({ where });
  }

  findByIds(ruleIds: string[]): Promise<RuleRecord[]> {
    return this.prisma.rule.findMany({
      where: { ruleId: { in: ruleIds } },
    });
  }

  async findPage(
    filter: Prisma.RuleWhereInput,
    page: number,
    limit: number,
    sortBy: string,
    sortOrder: 'asc' | 'desc',
  ): Promise<{ rows: RuleRecord[]; total: number }> {
    const orderBy = { [sortBy]: sortOrder } as Prisma.RuleOrderByWithRelationInput;
    const [rows, total] = await Promise.all([
      this.prisma.rule.findMany({
        where: filter,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.rule.count({ where: filter }),
    ]);
    return { rows, total };
  }

  count(where: Prisma.RuleWhereInput): Promise<number> {
    return this.prisma.rule.count({ where });
  }

  create(data: Prisma.RuleCreateInput): Promise<RuleRecord> {
    return this.prisma.rule.create({ data });
  }

  async updateById(
    ruleId: string,
    data: Prisma.RuleUpdateInput,
    auth?: TenancyAuth,
  ): Promise<RuleRecord | null> {
    const where = auth ? mergeTenancyWhere({ ruleId }, auth) : { ruleId };
    const existing = await this.prisma.rule.findFirst({ where });
    if (!existing) return null;
    return this.prisma.rule.update({ where: { ruleId }, data });
  }

  updateNewsTrigger(
    ruleId: string,
    newsTrigger: Prisma.InputJsonValue,
    auth?: TenancyAuth,
  ): Promise<RuleRecord | null> {
    return this.updateById(ruleId, { newsTrigger }, auth);
  }

  async appendVersion(
    ruleId: string,
    data: Prisma.RuleUpdateInput,
    versionEntry: unknown,
    auth?: TenancyAuth,
  ): Promise<RuleRecord | null> {
    const existing = await this.findById(ruleId, auth);
    if (!existing) return null;
    const versions = Array.isArray(existing.versions)
      ? [...(existing.versions as unknown[]), versionEntry]
      : [versionEntry];
    return this.updateById(
      ruleId,
      { ...data, versions: versions as Prisma.InputJsonValue },
      auth,
    );
  }

  async findNewsTriggerEligible(isMorning: boolean): Promise<RuleRecord[]> {
    const rows = await this.prisma.rule.findMany({
      where: {
        newsTrigger: {
          path: ['enabled'],
          equals: true,
        },
      },
    });
    return rows.filter((rule) => {
      const nt = rule.newsTrigger as { schedule?: string } | null;
      if (!nt?.schedule) return false;
      if (isMorning) {
        return nt.schedule === 'daily' || nt.schedule === 'twice_daily';
      }
      return nt.schedule === 'twice_daily';
    });
  }

  async findNewsTriggerGroupEligible(
    country: string,
    language: string,
    category: string,
  ): Promise<RuleRecord[]> {
    const today = startOfDay(new Date());
    const eightHoursAgo = subHours(new Date(), 8);

    const rows = await this.prisma.rule.findMany({
      where: {
        status: 'active',
        newsTrigger: {
          path: ['enabled'],
          equals: true,
        },
      },
    });

    return rows.filter((rule) => {
      const nt = rule.newsTrigger as {
        country?: string;
        language?: string;
        category?: string;
        schedule?: string;
        lastTriggeredAt?: string | Date | null;
      } | null;
      if (!nt) return false;
      if (nt.country !== country || nt.language !== language) return false;
      if ((nt.category ?? '') !== category) return false;

      const lastAt = nt.lastTriggeredAt
        ? new Date(nt.lastTriggeredAt)
        : null;
      if (!lastAt) return true;
      if (nt.schedule === 'daily') return lastAt < today;
      if (nt.schedule === 'twice_daily') return lastAt < eightHoursAgo;
      return false;
    });
  }
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function subHours(d: Date, hours: number): Date {
  return new Date(d.getTime() - hours * 3_600_000);
}
