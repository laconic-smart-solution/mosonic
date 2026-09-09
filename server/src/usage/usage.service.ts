import { Inject, Injectable, Logger } from '@nestjs/common';
import { CreditConfigService } from '../credit/credit-config.service';
import { currentBillingPeriod } from '../credit/lib/billing-period.util';
import { periodCreditBudget } from '../credit/lib/period-credit-budget.util';
import type { ICreditLedgerRepository } from '../repositories/interfaces/credit-ledger.repository.interface';
import type { ICreditTopupPurchaseRepository } from '../repositories/interfaces/credit-topup-purchase.repository.interface';
import type { IPlanPurchaseRepository } from '../repositories/interfaces/plan-purchase.repository.interface';
import type { IPlanRepository } from '../repositories/interfaces/plan.repository.interface';
import type { IUserPlanRepository } from '../repositories/interfaces/user-plan.repository.interface';
import type { IUserRepository } from '../repositories/interfaces/user.repository.interface';
import {
  CREDIT_LEDGER_REPOSITORY,
  CREDIT_TOPUP_PURCHASE_REPOSITORY,
  PLAN_PURCHASE_REPOSITORY,
  PLAN_REPOSITORY,
  USER_PLAN_REPOSITORY,
  USER_REPOSITORY,
} from '../repositories/tokens';
import { PlanService } from '../plan/plan.service';
import { PaymentService } from '../payment/payment.service';

export type PurchaseHistoryEntry = {
  id: string;
  type: 'topup' | 'plan';
  label: string;
  credits: number | null;
  amount: number;
  currencyCode: string;
  status: string;
  purchaseDate: Date;
};

function parseDate(value?: string): Date | undefined {
  if (!value?.trim()) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function displayName(u: {
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  email?: string | null;
}): string {
  const parts = [u.firstName, u.lastName].filter(Boolean) as string[];
  if (parts.length) return parts.join(' ');
  return u.username ?? u.email ?? '';
}

@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name);

  constructor(
    @Inject(CREDIT_LEDGER_REPOSITORY)
    private readonly ledger: ICreditLedgerRepository,
    @Inject(USER_PLAN_REPOSITORY)
    private readonly userPlans: IUserPlanRepository,
    @Inject(PLAN_REPOSITORY) private readonly plans: IPlanRepository,
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
    @Inject(CREDIT_TOPUP_PURCHASE_REPOSITORY)
    private readonly topupPurchases: ICreditTopupPurchaseRepository,
    @Inject(PLAN_PURCHASE_REPOSITORY)
    private readonly planPurchases: IPlanPurchaseRepository,
    private readonly creditConfig: CreditConfigService,
    private readonly planService: PlanService,
    private readonly paymentService: PaymentService,
  ) {}

  private buildDateFilter(from?: string, to?: string) {
    const fromDate = parseDate(from);
    const toDate = parseDate(to);
    if (!fromDate && !toDate) return {};
    const createdAt: { gte?: Date; lte?: Date } = {};
    if (fromDate) createdAt.gte = fromDate;
    if (toDate) createdAt.lte = toDate;
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
    const filter = {
      userId,
      ...this.buildDateFilter(query.from, query.to),
      ...(query.nodeType ? { nodeType: query.nodeType } : {}),
    };

    const { rows: entries, total } = await this.ledger.findUserHistory(
      userId,
      filter,
      page,
      limit,
    );

    return {
      entries,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  /**
   * Combines credit top-up purchases and plan purchases into one list, newest
   * first — this is money-in history, distinct from `getUserHistory` (credit
   * spend). Merged and paginated in memory: per-user purchase volume is small
   * (a handful of top-ups/renewals), so a DB-level UNION isn't worth the
   * complexity across two separate tables.
   */
  async getPurchaseHistory(
    userId: string,
    query: { page?: number; limit?: number },
  ): Promise<{
    entries: PurchaseHistoryEntry[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const [topupPurchases, planPurchases] = await Promise.all([
      this.topupPurchases.findByUserId(userId),
      this.planPurchases.findByUserId(userId),
    ]);

    const packageLabelByCode = new Map<string, string>();
    if (topupPurchases.length > 0) {
      try {
        const topupPlans = await this.paymentService.listTopupPlans({
          activeOnly: false,
        });
        for (const plan of topupPlans) {
          packageLabelByCode.set(plan.code, plan.label);
        }
      } catch (err) {
        this.logger.warn(
          `Could not resolve topup package labels: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const planIds = [...new Set(planPurchases.map((p) => p.planId))];
    const planNameById = new Map<string, string>();
    if (planIds.length > 0) {
      const plans = await this.plans.findManyByPlanIds(planIds);
      for (const plan of plans) {
        planNameById.set(plan.planId, plan.name);
      }
    }

    const combined: PurchaseHistoryEntry[] = [
      ...topupPurchases.map(
        (p): PurchaseHistoryEntry => ({
          id: p.topupPurchaseId,
          type: 'topup',
          label: packageLabelByCode.get(p.packageId) ?? p.packageId,
          credits: p.credits,
          amount: p.amount,
          currencyCode: p.currencyCode,
          status: p.status,
          purchaseDate: p.purchaseDate,
        }),
      ),
      ...planPurchases.map(
        (p): PurchaseHistoryEntry => ({
          id: p.planPurchaseId,
          type: 'plan',
          label: planNameById.get(p.planId) ?? p.planId,
          credits: null,
          amount: p.amount,
          currencyCode: p.currencyCode,
          status: p.status,
          purchaseDate: p.purchaseDate,
        }),
      ),
    ].sort((a, b) => b.purchaseDate.getTime() - a.purchaseDate.getTime());

    const total = combined.length;
    const start = (page - 1) * limit;
    const entries = combined.slice(start, start + limit);

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
    const userPlan = await this.userPlans.findActiveByUserId(userId);
    const plan = userPlan
      ? await this.plans.findByPlanId(userPlan.planId)
      : null;

    const entries = await this.ledger.findByUserAndBillingPeriod(
      userId,
      billingPeriod,
    );

    const byNodeTypeMap = new Map<
      string,
      { creditsCharged: number; count: number }
    >();
    const byDayMap = new Map<string, number>();
    let ledgerCreditsUsed = 0;

    for (const e of entries) {
      ledgerCreditsUsed += e.creditsCharged;
      const nt = e.nodeType ?? 'unknown';
      const cur = byNodeTypeMap.get(nt) ?? { creditsCharged: 0, count: 0 };
      cur.creditsCharged += e.creditsCharged;
      cur.count += 1;
      byNodeTypeMap.set(nt, cur);

      if (e.createdAt) {
        const day = e.createdAt.toISOString().slice(0, 10);
        byDayMap.set(day, (byDayMap.get(day) ?? 0) + e.creditsCharged);
      }
    }

    const creditsPerMonth = plan
      ? await this.planService.getCreditsForPlan(plan)
      : (userPlan?.creditsPerMonth ?? 0);
    const creditsRemaining = Math.max(0, userPlan?.creditsRemaining ?? 0);
    const creditsUsed = userPlan?.creditsUsed ?? ledgerCreditsUsed;
    const creditsBudget = periodCreditBudget({
      creditsPerMonth,
      creditsUsed,
      creditsRemaining,
    });
    const percentUsed =
      creditsBudget > 0
        ? Math.min(100, Math.round((creditsUsed / creditsBudget) * 100))
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
      creditsUsed,
      creditsRemaining,
      creditsPerMonth,
      creditsBudget,
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
    const filter = {
      ...this.buildDateFilter(query.from, query.to),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.nodeType ? { nodeType: query.nodeType } : {}),
      ...(query.provider ? { provider: query.provider } : {}),
    };

    const { rows: entries, total } = await this.ledger.findAdminHistory(
      filter,
      page,
      limit,
    );

    const userIds = [...new Set(entries.map((e) => e.userId))];
    const users = await this.users.findManyByUserIds(userIds, {
      userId: true,
      email: true,
      firstName: true,
      lastName: true,
      username: true,
    });
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

  async getAdminSummary(query: {
    from?: string;
    to?: string;
    userId?: string;
  }) {
    const filter = {
      ...this.buildDateFilter(query.from, query.to),
      ...(query.userId ? { userId: query.userId } : {}),
    };
    const entries = await this.ledger.findAdminSummary(filter);

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
    const byDay = new Map<
      string,
      { creditsCharged: number; rawCostUsd: number }
    >();

    for (const e of entries) {
      totalCreditsCharged += e.creditsCharged;
      totalRawCostUsd += e.rawCostUsd;

      const bump = (
        map: Map<
          string,
          { creditsCharged: number; rawCostUsd: number; count: number }
        >,
        key: string,
      ) => {
        const cur = map.get(key) ?? {
          creditsCharged: 0,
          rawCostUsd: 0,
          count: 0,
        };
        cur.creditsCharged += e.creditsCharged;
        cur.rawCostUsd += e.rawCostUsd;
        cur.count += 1;
        map.set(key, cur);
      };

      bump(byNodeType, e.nodeType);
      bump(byProvider, e.provider);
      bump(byUser, e.userId);

      if (!e.createdAt) continue;
      const day = e.createdAt.toISOString().slice(0, 10);
      const dayCur = byDay.get(day) ?? { creditsCharged: 0, rawCostUsd: 0 };
      dayCur.creditsCharged += e.creditsCharged;
      dayCur.rawCostUsd += e.rawCostUsd;
      byDay.set(day, dayCur);
    }

    const userIds = [...byUser.keys()];
    const [users, userPlans] = await Promise.all([
      this.users.findManyByUserIds(userIds, {
        userId: true,
        email: true,
        firstName: true,
        lastName: true,
        username: true,
      }),
      this.userPlans.findActiveByUserIds(userIds),
    ]);
    const userMap = new Map(users.map((u) => [u.userId, u]));
    const planIds = [...new Set(userPlans.map((up) => up.planId))];
    const plans = await this.plans.findManyByPlanIds(planIds);
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
