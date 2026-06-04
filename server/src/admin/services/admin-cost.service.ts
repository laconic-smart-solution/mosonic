import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CostEntry, type CostEntryDocument } from '../../cost/schemas/cost-entry.schema';
import { User, type UserDocument } from '../../users/schemas/user.schema';

function monthStart(d = new Date()): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), 1);
  x.setHours(0, 0, 0, 0);
  return x;
}

@Injectable()
export class AdminCostService {
  constructor(
    @InjectModel(CostEntry.name)
    private readonly costModel: Model<CostEntryDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async getPlatformCostSummary(from?: Date, to?: Date) {
    const mStart = monthStart();
    const fromDate = from ?? mStart;
    const toDate = to ?? new Date();

    const match = { createdAt: { $gte: fromDate, $lte: toDate } };

    const [
      totalCost,
      byProvider,
      byModel,
      byNodeType,
      byEntryType,
      topUsers,
      dailyTrend,
    ] = await Promise.all([
      this.costModel
        .aggregate([
          { $match: match },
          { $group: { _id: null, total: { $sum: '$costUsd' } } },
        ])
        .then((r) => r[0]?.total ?? 0),

      this.costModel.aggregate([
        { $match: match },
        { $group: { _id: '$provider', total: { $sum: '$costUsd' } } },
        { $sort: { total: -1 } },
      ]),

      this.costModel.aggregate([
        { $match: match },
        {
          $group: {
            _id: '$providerModel',
            total: { $sum: '$costUsd' },
            count: { $sum: 1 },
          },
        },
        { $sort: { total: -1 } },
        { $limit: 10 },
      ]),

      this.costModel.aggregate([
        { $match: match },
        {
          $group: {
            _id: '$nodeType',
            total: { $sum: '$costUsd' },
            count: { $sum: 1 },
          },
        },
        { $sort: { total: -1 } },
      ]),

      this.costModel.aggregate([
        { $match: match },
        { $group: { _id: '$entryType', total: { $sum: '$costUsd' } } },
        { $sort: { total: -1 } },
      ]),

      this.costModel.aggregate([
        { $match: match },
        { $group: { _id: '$userId', total: { $sum: '$costUsd' } } },
        { $sort: { total: -1 } },
        { $limit: 10 },
      ]),

      this.costModel.aggregate([
        { $match: match },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
            },
            total: { $sum: '$costUsd' },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const userIds = topUsers.map((u) => u._id).filter(Boolean) as string[];
    const users = await this.userModel
      .find({ userId: { $in: userIds } }, { email: 1, firstName: 1, lastName: 1, username: 1 })
      .lean();

    const userMap = Object.fromEntries(
      users.map((u) => [
        u.userId,
        {
          email: u.email,
          displayName: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || '',
        },
      ]),
    );

    return {
      totalCostUsd: totalCost,
      byProvider: Object.fromEntries(
        byProvider.map((r) => [r._id ?? 'unknown', r.total]),
      ),
      byEntryType: Object.fromEntries(
        byEntryType.map((r) => [r._id ?? 'unknown', r.total]),
      ),
      byNodeType: byNodeType.map((r) => ({
        nodeType: r._id ?? 'unknown',
        costUsd: r.total,
        count: r.count,
      })),
      byModel: byModel.map((r) => ({
        model: r._id ?? 'unknown',
        costUsd: r.total,
        count: r.count,
      })),
      topUsers: topUsers.map((r) => {
        const uid = r._id as string;
        const u = userMap[uid];
        return {
          userId: uid,
          email: u?.email ?? 'unknown',
          displayName: u?.displayName ?? '',
          costUsd: r.total,
        };
      }),
      dailyTrend: dailyTrend.map((row) => ({
        date: row._id,
        costUsd: row.total,
      })),
    };
  }

  async getMonthOverMonth() {
    const now = new Date();
    const thisMonth = monthStart(now);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    lastMonth.setHours(0, 0, 0, 0);

    const [thisMonthTotal, lastMonthTotal] = await Promise.all([
      this.costModel
        .aggregate([
          { $match: { billingPeriod: thisMonth } },
          { $group: { _id: null, total: { $sum: '$costUsd' } } },
        ])
        .then((r) => r[0]?.total ?? 0),

      this.costModel
        .aggregate([
          { $match: { billingPeriod: lastMonth } },
          { $group: { _id: null, total: { $sum: '$costUsd' } } },
        ])
        .then((r) => r[0]?.total ?? 0),
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
