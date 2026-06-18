import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreditConfigService } from '../credit/credit-config.service';
import { currentBillingPeriod } from '../credit/lib/billing-period.util';
import {
  CreditLedger,
  type CreditLedgerDocument,
} from '../credit/schemas/credit-ledger.schema';
import { Plan, type PlanDocument } from '../plan/schemas/plan.schema';
import { PlanService } from '../plan/plan.service';
import { UserPlan, type UserPlanDocument } from '../plan/schemas/user-plan.schema';
import { User, type UserDocument } from '../users/schemas/user.schema';

function parseDate(value?: string): Date | undefined {
  if (!value?.trim()) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function displayName(u: {
  firstName?: string;
  lastName?: string;
  username?: string;
  email?: string;
}): string {
  const parts = [u.firstName, u.lastName].filter(Boolean) as string[];
  if (parts.length) return parts.join(' ');
  return u.username ?? u.email ?? '';
}

@Injectable()
export class UsageService {
  constructor(
    @InjectModel(CreditLedger.name)
    private readonly ledgerModel: Model<CreditLedgerDocument>,
    @InjectModel(UserPlan.name)
    private readonly userPlanModel: Model<UserPlanDocument>,
    @InjectModel(Plan.name) private readonly planModel: Model<PlanDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly creditConfig: CreditConfigService,
    private readonly planService: PlanService,
  ) {}

  private buildDateFilter(from?: string, to?: string) {
    const fromDate = parseDate(from);
    const toDate = parseDate(to);
    if (!fromDate && !toDate) return {};
    const createdAt: { $gte?: Date; $lte?: Date } = {};
    if (fromDate) createdAt.$gte = fromDate;
    if (toDate) createdAt.$lte = toDate;
    return { createdAt };
  }

  async getUserHistory(
    userId: string,
    query: {
      from?: string;
      to?: string;
      nodeType?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const filter: Record<string, unknown> = {
      userId,
      ...this.buildDateFilter(query.from, query.to),
    };
    if (query.nodeType) filter.nodeType = query.nodeType;

    const [entries, total] = await Promise.all([
      this.ledgerModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select({
          userId: 1,
          pipelineRef: 1,
          campaignRef: 1,
          contentRef: 1,
          nodeId: 1,
          nodeType: 1,
          provider: 1,
          model: 1,
          creditsCharged: 1,
          creditPriceUsdSnapshot: 1,
          rawCostUsd: 1,
          billingPeriod: 1,
          createdAt: 1,
        })
        .lean()
        .exec(),
      this.ledgerModel.countDocuments(filter).exec(),
    ]);

    return {
      entries,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async getUserSummary(userId: string) {
    const billingPeriod = currentBillingPeriod();
    const creditPriceUsd = await this.creditConfig.getCreditPriceUsd();
    const userPlan = await this.userPlanModel
      .findOne({ userId, status: 'active' })
      .lean()
      .exec();
    const plan = userPlan
      ? await this.planModel.findOne({ planId: userPlan.planId }).lean().exec()
      : null;

    const match = { userId, billingPeriod };
    const entries = await this.ledgerModel.find(match).lean().exec();

    const byNodeTypeMap = new Map<string, { creditsCharged: number; count: number }>();
    const byDayMap = new Map<string, number>();
    let creditsUsed = 0;

    for (const e of entries) {
      creditsUsed += e.creditsCharged;
      const nt = e.nodeType ?? 'unknown';
      const cur = byNodeTypeMap.get(nt) ?? { creditsCharged: 0, count: 0 };
      cur.creditsCharged += e.creditsCharged;
      cur.count += 1;
      byNodeTypeMap.set(nt, cur);

      const createdAt = (e as { createdAt?: Date }).createdAt;
      if (createdAt) {
        const day = createdAt.toISOString().slice(0, 10);
        byDayMap.set(day, (byDayMap.get(day) ?? 0) + e.creditsCharged);
      }
    }

    const creditsPerMonth = plan
      ? await this.planService.getCreditsForPlan(plan)
      : userPlan?.creditsPerMonth ?? 0;
    const creditsRemaining = userPlan?.creditsRemaining ?? 0;
    const percentUsed =
      creditsPerMonth > 0
        ? Math.round((creditsUsed / creditsPerMonth) * 100)
        : 0;

    return {
      creditPriceUsd,
      plan: plan
        ? {
            name: plan.name,
            creditsPerMonth,
            priceThb: plan.priceThb,
          }
        : null,
      creditsUsed: userPlan?.creditsUsed ?? creditsUsed,
      creditsRemaining,
      creditsPerMonth,
      percentUsed,
      billingPeriod: userPlan?.billingPeriod ?? billingPeriod,
      byNodeType: [...byNodeTypeMap.entries()].map(([nodeType, v]) => ({
        nodeType,
        creditsCharged: v.creditsCharged,
        count: v.count,
      })),
      dailyTrend: [...byDayMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, creditsCharged]) => ({ date, creditsCharged })),
      totalGenerations: entries.length,
    };
  }

  async getCurrentPlan(userId: string) {
    const data = await this.planService.getUserPlan(userId);
    if (!data) return null;
    const creditPriceUsd = await this.creditConfig.getCreditPriceUsd();
    return {
      creditPriceUsd,
      plan: data.plan,
      creditsUsed: data.userPlan.creditsUsed,
      creditsRemaining: data.userPlan.creditsRemaining,
      billingPeriod: data.userPlan.billingPeriod,
    };
  }

  async getAdminHistory(query: {
    from?: string;
    to?: string;
    userId?: string;
    nodeType?: string;
    provider?: string;
    page?: number;
    limit?: number;
  }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const filter: Record<string, unknown> = {
      ...this.buildDateFilter(query.from, query.to),
    };
    if (query.userId) filter.userId = query.userId;
    if (query.nodeType) filter.nodeType = query.nodeType;
    if (query.provider) filter.provider = query.provider;

    const [entries, total] = await Promise.all([
      this.ledgerModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.ledgerModel.countDocuments(filter).exec(),
    ]);

    const userIds = [...new Set(entries.map((e) => e.userId))];
    const users = await this.userModel
      .find({ userId: { $in: userIds } })
      .select({ userId: 1, email: 1, firstName: 1, lastName: 1, username: 1 })
      .lean()
      .exec();
    const userMap = new Map(users.map((u) => [u.userId, u]));

    return {
      entries: entries.map((e) => ({
        ...e,
        email: userMap.get(e.userId)?.email,
      })),
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async getAdminSummary(query: { from?: string; to?: string; userId?: string }) {
    const filter: Record<string, unknown> = {
      ...this.buildDateFilter(query.from, query.to),
    };
    if (query.userId) filter.userId = query.userId;
    const entries = await this.ledgerModel.find(filter).lean().exec();

    let totalCreditsCharged = 0;
    let totalRawCostUsd = 0;
    const byNodeType = new Map<
      string,
      { creditsCharged: number; rawCostUsd: number; count: number }
    >();
    const byProvider = new Map<
      string,
      { creditsCharged: number; rawCostUsd: number; count: number }
    >();
    const byUser = new Map<
      string,
      { creditsCharged: number; rawCostUsd: number; count: number }
    >();
    const byDay = new Map<string, { creditsCharged: number; rawCostUsd: number }>();

    for (const e of entries) {
      totalCreditsCharged += e.creditsCharged;
      totalRawCostUsd += e.rawCostUsd;

      const bump = (
        map: Map<string, { creditsCharged: number; rawCostUsd: number; count: number }>,
        key: string,
      ) => {
        const cur = map.get(key) ?? { creditsCharged: 0, rawCostUsd: 0, count: 0 };
        cur.creditsCharged += e.creditsCharged;
        cur.rawCostUsd += e.rawCostUsd;
        cur.count += 1;
        map.set(key, cur);
      };

      bump(byNodeType, e.nodeType);
      bump(byProvider, e.provider);
      bump(byUser, e.userId);

      const createdAt = (e as { createdAt?: Date }).createdAt;
      if (!createdAt) continue;
      const day = createdAt.toISOString().slice(0, 10);
      const dayCur = byDay.get(day) ?? { creditsCharged: 0, rawCostUsd: 0 };
      dayCur.creditsCharged += e.creditsCharged;
      dayCur.rawCostUsd += e.rawCostUsd;
      byDay.set(day, dayCur);
    }

    const userIds = [...byUser.keys()];
    const [users, userPlans] = await Promise.all([
      this.userModel
        .find({ userId: { $in: userIds } })
        .select({ userId: 1, email: 1, firstName: 1, lastName: 1, username: 1 })
        .lean()
        .exec(),
      this.userPlanModel
        .find({ userId: { $in: userIds }, status: 'active' })
        .lean()
        .exec(),
    ]);
    const userMap = new Map(users.map((u) => [u.userId, u]));
    const planIds = [...new Set(userPlans.map((up) => up.planId))];
    const plans = await this.planModel
      .find({ planId: { $in: planIds } })
      .lean()
      .exec();
    const planMap = new Map(plans.map((p) => [p.planId, p]));
    const userPlanMap = new Map(userPlans.map((up) => [up.userId, up]));

    return {
      totalCreditsCharged,
      totalRawCostUsd,
      uniqueUsers: byUser.size,
      byNodeType: [...byNodeType.entries()].map(([nodeType, v]) => ({
        nodeType,
        ...v,
      })),
      byProvider: [...byProvider.entries()].map(([provider, v]) => ({
        provider,
        ...v,
      })),
      byUser: [...byUser.entries()].map(([userId, v]) => {
        const u = userMap.get(userId);
        const up = userPlanMap.get(userId);
        const plan = up ? planMap.get(up.planId) : undefined;
        return {
          userId,
          email: u?.email,
          displayName: u ? displayName(u) : undefined,
          planName: plan?.name,
          ...v,
        };
      }),
      dailyTrend: [...byDay.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => ({ date, ...v })),
    };
  }

  async getAdminUserHistory(
    userId: string,
    query: { from?: string; to?: string; page?: number; limit?: number },
  ) {
    return this.getAdminHistory({
      ...query,
      userId,
    });
  }
}
