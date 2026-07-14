import { Inject, Injectable } from '@nestjs/common';
import type { IContentRepository } from '../../repositories/interfaces/content.repository.interface';
import type { ICostEntryRepository } from '../../repositories/interfaces/cost-entry.repository.interface';
import type { IPipelineRepository } from '../../repositories/interfaces/pipeline.repository.interface';
import type { IRuleRepository } from '../../repositories/interfaces/rule.repository.interface';
import type { IUserRepository } from '../../repositories/interfaces/user.repository.interface';
import {
  CONTENT_REPOSITORY,
  COST_ENTRY_REPOSITORY,
  PIPELINE_REPOSITORY,
  RULE_REPOSITORY,
  USER_REPOSITORY,
} from '../../repositories/tokens';

function monthStart(d = new Date()): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), 1);
  x.setHours(0, 0, 0, 0);
  return x;
}

function ruleChannelNames(rule: { channels: unknown }): string[] {
  if (!Array.isArray(rule.channels)) return [];
  return (rule.channels as Array<{ channel?: string }>)
    .map((x) => x.channel)
    .filter((c): c is string => Boolean(c));
}

@Injectable()
export class AdminDashboardService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(PIPELINE_REPOSITORY)
    private readonly pipelines: IPipelineRepository,
    @Inject(CONTENT_REPOSITORY) private readonly content: IContentRepository,
    @Inject(COST_ENTRY_REPOSITORY)
    private readonly costEntries: ICostEntryRepository,
    @Inject(RULE_REPOSITORY) private readonly rules: IRuleRepository,
  ) {}

  async getOverview() {
    const now = new Date();
    const mStart = monthStart(now);
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 7);

    const [
      totalUsers,
      newUsersThisMonth,
      newUsersThisWeek,
      activeUserIds,
      totalPipelinesThisMonth,
      totalContentThisMonth,
      platformCostThisMonth,
    ] = await Promise.all([
      this.users.count(),
      this.users.count({ createdAt: { gte: mStart } }),
      this.users.count({ createdAt: { gte: weekStart } }),
      this.pipelines.distinctUserIdsSince(mStart),
      this.pipelines.count({ startedAt: { gte: mStart } }),
      this.content.countSince(mStart),
      this.costEntries.sumForBillingPeriod(mStart),
    ]);

    return {
      users: {
        total: totalUsers,
        newThisMonth: newUsersThisMonth,
        newThisWeek: newUsersThisWeek,
        activeThisMonth: activeUserIds.length,
      },
      usage: {
        pipelinesThisMonth: totalPipelinesThisMonth,
        contentThisMonth: totalContentThisMonth,
      },
      cost: {
        totalThisMonthUsd: platformCostThisMonth,
      },
    };
  }

  async getUserGrowthChart(days = 30) {
    const from = new Date();
    from.setDate(from.getDate() - days);

    const users = await this.users.findCreatedSince(from);

    return this.groupByDay(users, 'createdAt');
  }

  async getPipelineChart(days = 30) {
    const from = new Date();
    from.setDate(from.getDate() - days);

    const total = await this.pipelines.count({ startedAt: { gte: from } });
    const { rows: pipelines } = await this.pipelines.findPage(
      { startedAt: { gte: from } },
      1,
      Math.max(total, 1),
      'startedAt',
      'asc',
    );

    return this.groupByDay(pipelines, 'startedAt');
  }

  async getCostChart(days = 30) {
    const from = new Date();
    from.setDate(from.getDate() - days);

    const entries = await this.costEntries.findInCreatedAtRange(
      from,
      new Date(),
    );

    return this.groupSumByDay(entries, 'createdAt', 'costUsd');
  }

  async getNodeTypeBreakdown() {
    const mStart = monthStart();

    const entries = await this.costEntries.aggregateSummary({
      createdAt: { gte: mStart },
    });

    const grouped = new Map<string, { count: number; totalCost: number }>();
    for (const row of entries) {
      const key = row.nodeType ?? 'unknown';
      const cur = grouped.get(key) ?? { count: 0, totalCost: 0 };
      cur.count += 1;
      cur.totalCost += row.costUsd;
      grouped.set(key, cur);
    }

    return [...grouped.entries()]
      .map(([nodeType, stats]) => ({
        nodeType,
        count: stats.count,
        costUsd: stats.totalCost,
      }))
      .sort((a, b) => b.count - a.count);
  }

  async getPipelineSlo(days = 7) {
    const from = new Date();
    from.setDate(from.getDate() - days);
    const total = await this.pipelines.count({ startedAt: { gte: from } });
    const { rows: pipelines } = await this.pipelines.findPage(
      { startedAt: { gte: from } },
      1,
      Math.max(total, 1),
      'startedAt',
      'desc',
    );

    const durations: number[] = [];
    let failed = 0;
    let completed = 0;
    for (const p of pipelines) {
      if (p.status === 'failed') failed += 1;
      if (p.status === 'completed') {
        completed += 1;
        if (p.completedAt && p.startedAt) {
          durations.push(
            new Date(p.completedAt).getTime() - new Date(p.startedAt).getTime(),
          );
        }
      }
    }
    durations.sort((a, b) => a - b);
    const p50 =
      durations.length > 0 ? durations[Math.floor(durations.length * 0.5)] : 0;
    const p95 =
      durations.length > 0 ? durations[Math.floor(durations.length * 0.95)] : 0;
    return {
      total: pipelines.length,
      completed,
      failed,
      failureRate: pipelines.length ? failed / pipelines.length : 0,
      durationMs: { p50, p95 },
    };
  }

  async getChannelBreakdown() {
    const mStart = monthStart();
    const total = await this.content.countSince(mStart);
    const { rows: contents } = await this.content.findPageAdmin(
      { createdAt: { gte: mStart } },
      1,
      Math.max(total, 1),
    );

    const ruleRefs = [
      ...new Set(contents.map((c) => c.ruleRef).filter(Boolean)),
    ];
    const rules = ruleRefs.length ? await this.rules.findByIds(ruleRefs) : [];
    const ruleChannelMap = new Map(
      rules.map((r) => [r.ruleId, ruleChannelNames(r)]),
    );

    const counts = new Map<string, number>();
    for (const c of contents) {
      const channels = ruleChannelMap.get(c.ruleRef) ?? [];
      for (const channel of channels) {
        counts.set(channel, (counts.get(channel) ?? 0) + 1);
      }
    }

    return [...counts.entries()]
      .map(([channel, count]) => ({ channel, count }))
      .sort((a, b) => b.count - a.count);
  }

  private groupByDay(
    docs: { [k: string]: unknown }[],
    dateField: string,
  ): Record<string, number> {
    return docs.reduce<Record<string, number>>((acc, doc) => {
      const raw = doc[dateField];
      if (!(raw instanceof Date) && typeof raw !== 'string') return acc;
      const day = new Date(raw).toISOString().slice(0, 10);
      acc[day] = (acc[day] ?? 0) + 1;
      return acc;
    }, {});
  }

  private groupSumByDay(
    docs: { [k: string]: unknown }[],
    dateField: string,
    valueField: string,
  ): Record<string, number> {
    return docs.reduce<Record<string, number>>((acc, doc) => {
      const raw = doc[dateField];
      if (!(raw instanceof Date) && typeof raw !== 'string') return acc;
      const day = new Date(raw).toISOString().slice(0, 10);
      const v = doc[valueField];
      acc[day] = (acc[day] ?? 0) + (typeof v === 'number' ? v : 0);
      return acc;
    }, {});
  }
}
