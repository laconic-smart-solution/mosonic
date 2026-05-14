import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Content, type ContentDocument } from '../../content/schemas/content.schema';
import { CostEntry, type CostEntryDocument } from '../../cost/schemas/cost-entry.schema';
import { Pipeline, type PipelineDocument } from '../../pipeline/schemas/pipeline.schema';
import { User, type UserDocument } from '../../users/schemas/user.schema';

function monthStart(d = new Date()): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), 1);
  x.setHours(0, 0, 0, 0);
  return x;
}

@Injectable()
export class AdminDashboardService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Pipeline.name)
    private readonly pipelineModel: Model<PipelineDocument>,
    @InjectModel(Content.name)
    private readonly contentModel: Model<ContentDocument>,
    @InjectModel(CostEntry.name)
    private readonly costModel: Model<CostEntryDocument>,
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
      activeUsersThisMonth,
      totalPipelinesThisMonth,
      totalContentThisMonth,
      platformCostThisMonth,
    ] = await Promise.all([
      this.userModel.countDocuments(),
      this.userModel.countDocuments({ createdAt: { $gte: mStart } }),
      this.userModel.countDocuments({ createdAt: { $gte: weekStart } }),
      this.pipelineModel
        .distinct('userId', {
          startedAt: { $gte: mStart },
          userId: { $exists: true, $nin: [null, ''] },
        })
        .then((ids) => ids.filter(Boolean).length),
      this.pipelineModel.countDocuments({ startedAt: { $gte: mStart } }),
      this.contentModel.countDocuments({ createdAt: { $gte: mStart } }),
      this.costModel
        .aggregate([
          { $match: { billingPeriod: mStart } },
          { $group: { _id: null, total: { $sum: '$costUsd' } } },
        ])
        .then((r) => r[0]?.total ?? 0),
    ]);

    return {
      users: {
        total: totalUsers,
        newThisMonth: newUsersThisMonth,
        newThisWeek: newUsersThisWeek,
        activeThisMonth: activeUsersThisMonth,
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

    const users = await this.userModel
      .find({ createdAt: { $gte: from } }, { createdAt: 1 })
      .lean();

    return this.groupByDay(
      users as unknown as { [k: string]: unknown }[],
      'createdAt',
    );
  }

  async getPipelineChart(days = 30) {
    const from = new Date();
    from.setDate(from.getDate() - days);

    const pipelines = await this.pipelineModel
      .find({ startedAt: { $gte: from } }, { startedAt: 1 })
      .lean();

    return this.groupByDay(
      pipelines as unknown as { [k: string]: unknown }[],
      'startedAt',
    );
  }

  async getCostChart(days = 30) {
    const from = new Date();
    from.setDate(from.getDate() - days);

    const entries = await this.costModel
      .find({ createdAt: { $gte: from } }, { createdAt: 1, costUsd: 1 })
      .lean();

    return this.groupSumByDay(
      entries as unknown as { [k: string]: unknown }[],
      'createdAt',
      'costUsd',
    );
  }

  async getNodeTypeBreakdown() {
    const mStart = monthStart();

    const result = await this.costModel.aggregate([
      { $match: { createdAt: { $gte: mStart } } },
      {
        $group: {
          _id: '$nodeType',
          count: { $sum: 1 },
          totalCost: { $sum: '$costUsd' },
        },
      },
      { $sort: { count: -1 } },
    ]);

    return result.map((r) => ({
      nodeType: r._id ?? 'unknown',
      count: r.count,
      costUsd: r.totalCost,
    }));
  }

  async getChannelBreakdown() {
    const mStart = monthStart();

    const result = await this.contentModel.aggregate([
      { $match: { createdAt: { $gte: mStart } } },
      {
        $lookup: {
          from: 'rules',
          localField: 'ruleRef',
          foreignField: 'ruleId',
          as: 'ruleDoc',
        },
      },
      { $unwind: { path: '$ruleDoc', preserveNullAndEmptyArrays: false } },
      { $unwind: { path: '$ruleDoc.channels', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$ruleDoc.channels.channel',
          count: { $sum: 1 },
        },
      },
      { $match: { _id: { $nin: [null, ''] } } },
      { $sort: { count: -1 } },
    ]);

    return result.map((r) => ({ channel: r._id, count: r.count }));
  }

  private groupByDay(
    docs: { [k: string]: unknown }[],
    dateField: string,
  ): Record<string, number> {
    return docs.reduce<Record<string, number>>((acc, doc) => {
      const raw = doc[dateField];
      if (!(raw instanceof Date) && typeof raw !== 'string') return acc;
      const day = new Date(raw as string | Date).toISOString().slice(0, 10);
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
      const day = new Date(raw as string | Date).toISOString().slice(0, 10);
      const v = doc[valueField];
      acc[day] = (acc[day] ?? 0) + (typeof v === 'number' ? v : 0);
      return acc;
    }, {});
  }
}
