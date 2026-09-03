import { Inject, Injectable } from '@nestjs/common';
import type { CostEntryRecord } from '../../repositories/interfaces/cost-entry.repository.interface';
import type { ICostEntryRepository } from '../../repositories/interfaces/cost-entry.repository.interface';
import type { IUserRepository } from '../../repositories/interfaces/user.repository.interface';
import {
  COST_ENTRY_REPOSITORY,
  USER_REPOSITORY,
} from '../../repositories/tokens';

function monthStart(d = new Date()): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), 1);
  x.setHours(0, 0, 0, 0);
  return x;
}

function groupSum(
  entries: CostEntryRecord[],
  field: keyof CostEntryRecord,
): Map<string, number> {
  const acc = new Map<string, number>();
  for (const e of entries) {
    const key = String(e[field] ?? 'unknown');
    acc.set(key, (acc.get(key) ?? 0) + e.costUsd);
  }
  return acc;
}

function groupSumWithCount(
  entries: CostEntryRecord[],
  field: keyof CostEntryRecord,
): Map<string, { total: number; count: number }> {
  const acc = new Map<string, { total: number; count: number }>();
  for (const e of entries) {
    const key = String(e[field] ?? 'unknown');
    const cur = acc.get(key) ?? { total: 0, count: 0 };
    cur.total += e.costUsd;
    cur.count += 1;
    acc.set(key, cur);
  }
  return acc;
}

function dailyTrend(
  entries: CostEntryRecord[],
): Array<{ date: string; costUsd: number }> {
  const byDay = new Map<string, number>();
  for (const e of entries) {
    const day = e.createdAt.toISOString().slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + e.costUsd);
  }
  return [...byDay.entries()]
    .map(([date, costUsd]) => ({ date, costUsd }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

@Injectable()
export class AdminCostService {
  constructor(
    @Inject(COST_ENTRY_REPOSITORY)
    private readonly costEntries: ICostEntryRepository,
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
  ) {}

  async getPlatformCostSummary(from?: Date, to?: Date) {
    const mStart = monthStart();
    const fromDate = from ?? mStart;
    const toDate = to ?? new Date();

    const entries = await this.costEntries.findInCreatedAtRange(
      fromDate,
      toDate,
    );

    const totalCost = entries.reduce((sum, e) => sum + e.costUsd, 0);
    const byProvider = groupSum(entries, 'provider');
    const byEntryType = groupSum(entries, 'entryType');
    const byNodeType = groupSumWithCount(entries, 'nodeType');
    const byModel = groupSumWithCount(entries, 'providerModel');

    const userTotals = groupSum(entries, 'userId');
    const topUsers = [...userTotals.entries()]
      .map(([userId, total]) => ({ userId, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    const userIds = topUsers.map((u) => u.userId).filter(Boolean);
    const userRows = await this.users.findManyByUserIds(userIds, {
      email: true,
      firstName: true,
      lastName: true,
      username: true,
    });

    const userMap = Object.fromEntries(
      userRows.map((u) => [
        u.userId,
        {
          email: u.email,
          displayName:
            [u.firstName, u.lastName].filter(Boolean).join(' ') ||
            u.username ||
            '',
        },
      ]),
    );

    return {
      totalCostUsd: totalCost,
      byProvider: Object.fromEntries(byProvider),
      byEntryType: Object.fromEntries(byEntryType),
      byNodeType: [...byNodeType.entries()]
        .map(([nodeType, stats]) => ({
          nodeType,
          costUsd: stats.total,
          count: stats.count,
        }))
        .sort((a, b) => b.costUsd - a.costUsd),
      byModel: [...byModel.entries()]
        .map(([model, stats]) => ({
          model,
          costUsd: stats.total,
          count: stats.count,
        }))
        .sort((a, b) => b.costUsd - a.costUsd)
        .slice(0, 10),
      topUsers: topUsers.map((r) => {
        const u = userMap[r.userId];
        return {
          userId: r.userId,
          email: u?.email ?? 'unknown',
          displayName: u?.displayName ?? '',
          costUsd: r.total,
        };
      }),
      dailyTrend: dailyTrend(entries),
    };
  }

  async getMonthOverMonth() {
    const now = new Date();
    const thisMonth = monthStart(now);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    lastMonth.setHours(0, 0, 0, 0);

    const [thisMonthTotal, lastMonthTotal] = await Promise.all([
      this.costEntries.sumForBillingPeriod(thisMonth),
      this.costEntries.sumForBillingPeriod(lastMonth),
    ]);

    const changePct =
      lastMonthTotal === 0
        ? null
        : ((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100;

    return {
      thisMonth: { period: thisMonth, totalUsd: thisMonthTotal },
      lastMonth: { period: lastMonth, totalUsd: lastMonthTotal },
      changePct: changePct == null ? null : Math.round(changePct),
    };
  }
}
