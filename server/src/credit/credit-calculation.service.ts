import { Inject, Injectable } from '@nestjs/common';
import type { ServiceRateType } from '@prisma/client';
import type { CreditConfigRecord } from '../domain/credit/credit.types';
import type { ICreditConfigRepository } from '../repositories/interfaces/credit-config.repository.interface';
import type { IFixedCostRepository } from '../repositories/interfaces/fixed-cost.repository.interface';
import type { IPlanRepository } from '../repositories/interfaces/plan.repository.interface';
import type { IServiceRateRepository } from '../repositories/interfaces/service-rate.repository.interface';
import {
  CREDIT_CONFIG_REPOSITORY,
  FIXED_COST_REPOSITORY,
  PLAN_REPOSITORY,
  SERVICE_RATE_REPOSITORY,
} from '../repositories/tokens';

export type CreditCalculationResult = {
  rawCostUsd: number;
  overheadUsd: number;
  marginAppliedUsd: number;
  creditsCharged: number;
  creditPriceUsdSnapshot: number;
};

export type PreviewNodeInput = {
  serviceType: ServiceRateType;
  model: string;
  provider?: string;
  count?: number;
  durationSec?: number;
};

type LegacyHistoryEntry = Record<string, unknown>;

function normalizeHistoryEntry(
  entry: LegacyHistoryEntry,
  fallback: {
    creditPriceUsd: number;
    marginTarget: number;
    basicUsersPerMonth: number;
    overheadFactor: number;
  },
) {
  const changedAtRaw = entry.changedAt;
  const changedAt =
    changedAtRaw instanceof Date
      ? changedAtRaw
      : changedAtRaw
        ? new Date(String(changedAtRaw))
        : new Date();

  return {
    creditPriceUsd: Number(
      entry.creditPriceUsd ?? entry.creditValueUsd ?? fallback.creditPriceUsd,
    ),
    marginTarget: Number(
      entry.marginTarget ?? entry.marginMultiplier ?? fallback.marginTarget,
    ),
    basicUsersPerMonth: Number(
      entry.basicUsersPerMonth ?? fallback.basicUsersPerMonth,
    ),
    overheadFactor: Number(entry.overheadFactor ?? fallback.overheadFactor),
    changedAt: Number.isNaN(changedAt.getTime()) ? new Date() : changedAt,
    changedBy: String(entry.changedBy ?? 'system'),
  };
}

@Injectable()
export class CreditCalculationService {
  constructor(
    @Inject(CREDIT_CONFIG_REPOSITORY)
    private readonly creditConfig: ICreditConfigRepository,
    @Inject(FIXED_COST_REPOSITORY)
    private readonly fixedCosts: IFixedCostRepository,
    @Inject(SERVICE_RATE_REPOSITORY)
    private readonly serviceRates: IServiceRateRepository,
    @Inject(PLAN_REPOSITORY)
    private readonly plans: IPlanRepository,
  ) {}

  async getConfig(): Promise<CreditConfigRecord> {
    let doc = await this.creditConfig.findSingleton();
    if (!doc) {
      doc = await this.creditConfig.createSingleton({
        singletonKey: 'default',
        creditPriceUsd: 0.01,
        marginTarget: 3.0,
        basicUsersPerMonth: 50,
        overheadFactor: 0,
        derivedMargin: 0,
        changeHistory: [],
      });
    }
    return doc;
  }

  /** Backfill v2 fields and normalize legacy changeHistory rows from v1 config. */
  async ensureLegacyConfigMigrated(): Promise<void> {
    const raw = await this.creditConfig.findSingleton();
    if (!raw) return;

    const creditPriceUsd = Number(raw.creditPriceUsd ?? 0.01);
    const marginTarget = Number(
      raw.marginTarget ??
        (raw as { marginMultiplier?: number }).marginMultiplier ??
        3,
    );
    const basicUsersPerMonth = Number(raw.basicUsersPerMonth ?? 50);
    const overheadFactor = Number(raw.overheadFactor ?? 0);
    const derivedMargin = Number(raw.derivedMargin ?? 0);
    const fallback = {
      creditPriceUsd,
      marginTarget,
      basicUsersPerMonth,
      overheadFactor,
    };

    const history = (raw.changeHistory ??
      []) as unknown as LegacyHistoryEntry[];
    const needsHistoryFix = history.some(
      (entry) => entry.creditPriceUsd == null || entry.marginTarget == null,
    );

    const set: Record<string, unknown> = {};
    if (raw.creditPriceUsd == null) set.creditPriceUsd = creditPriceUsd;
    if (raw.marginTarget == null) set.marginTarget = marginTarget;
    if (raw.basicUsersPerMonth == null)
      set.basicUsersPerMonth = basicUsersPerMonth;
    if (raw.overheadFactor == null) set.overheadFactor = overheadFactor;
    if (raw.derivedMargin == null) set.derivedMargin = derivedMargin;
    if (needsHistoryFix) {
      set.changeHistory = history.map((entry) =>
        normalizeHistoryEntry(entry, fallback),
      );
    }

    const legacy = raw as {
      infraCostUsd?: number;
      maintCostUsd?: number;
      marginMultiplier?: number;
      creditsIssuedPerMonth?: number;
      creditValueUsd?: number;
    };
    const unsetKeys: string[] = [];
    if (legacy.infraCostUsd != null) unsetKeys.push('infraCostUsd');
    if (legacy.maintCostUsd != null) unsetKeys.push('maintCostUsd');
    if (legacy.marginMultiplier != null) unsetKeys.push('marginMultiplier');
    if (legacy.creditsIssuedPerMonth != null) {
      unsetKeys.push('creditsIssuedPerMonth');
    }
    if (legacy.creditValueUsd != null) unsetKeys.push('creditValueUsd');

    if (Object.keys(set).length === 0 && unsetKeys.length === 0) {
      return;
    }

    await this.creditConfig.migrateLegacyFields(set, unsetKeys);
  }

  async getTotalFixedCosts(): Promise<number> {
    const rows = await this.fixedCosts.listActive();
    return rows.reduce((sum, r) => sum + (r.amountUsd ?? 0), 0);
  }

  async getBasicPlanCredits(config: CreditConfigRecord): Promise<number> {
    const basicPlan = await this.plans.findByName('Basic');
    if (!basicPlan?.isActive || config.creditPriceUsd <= 0) return 0;
    return Math.floor(basicPlan.priceUsd / config.creditPriceUsd);
  }

  /**
   * overheadFactor = totalFixed / (basicUsers × basicPlanCredits × creditPriceUsd)
   */
  async recalculateOverheadFactor(): Promise<number> {
    const config = await this.getConfig();
    const totalFixed = await this.getTotalFixedCosts();
    const basicCredits = await this.getBasicPlanCredits(config);
    const targetCreditVolume = config.basicUsersPerMonth * basicCredits;

    let overheadFactor = 0;
    let derivedMargin = 0;

    if (targetCreditVolume > 0 && config.creditPriceUsd > 0) {
      const targetRevenueUsd = targetCreditVolume * config.creditPriceUsd;
      overheadFactor = totalFixed / targetRevenueUsd;

      const avgTextCost = await this.estimateDefaultTextCost();
      const costPerCredit =
        avgTextCost > 0
          ? (avgTextCost + avgTextCost * overheadFactor) * config.marginTarget
          : 0;
      derivedMargin =
        costPerCredit > 0 ? config.creditPriceUsd / costPerCredit : 0;
    }

    await this.creditConfig.updateOverhead(overheadFactor, derivedMargin);
    return overheadFactor;
  }

  private async estimateDefaultTextCost(): Promise<number> {
    const rate = await this.serviceRates.findFirstActiveByType('text');
    return rate?.avgPricePerCall ?? 0.01;
  }

  /** THE core formula — every credit charge calls this. */
  async calculateCredits(rawCostUsd: number): Promise<CreditCalculationResult> {
    const config = await this.getConfig();
    const overheadUsd = rawCostUsd * config.overheadFactor;
    const totalCost = rawCostUsd + overheadUsd;
    const marginAppliedUsd = totalCost * config.marginTarget;
    const creditsCharged =
      config.creditPriceUsd > 0
        ? Math.ceil(marginAppliedUsd / config.creditPriceUsd)
        : 0;

    return {
      rawCostUsd,
      overheadUsd,
      marginAppliedUsd,
      creditsCharged,
      creditPriceUsdSnapshot: config.creditPriceUsd,
    };
  }

  async estimateNodeRawCost(node: PreviewNodeInput): Promise<number> {
    const count = Math.max(1, node.count ?? 1);
    const rate = await this.serviceRates.findActiveRate({
      serviceType: node.serviceType,
      model: node.model,
      ...(node.provider?.trim() ? { provider: node.provider.trim() } : {}),
    });
    if (!rate) return 0;

    switch (node.serviceType) {
      case 'text':
        return (rate.avgPricePerCall ?? 0) * count;
      case 'image':
        return (rate.pricePerImage ?? 0) * count;
      case 'video': {
        const seconds = Math.max(1, node.durationSec ?? 8);
        return (rate.pricePerSecond ?? 0) * seconds * count;
      }
      default:
        return 0;
    }
  }

  async previewWorkflow(nodes: PreviewNodeInput[]) {
    const nodeResults: Array<PreviewNodeInput & CreditCalculationResult> = [];

    let rawCostUsd = 0;
    let overheadUsd = 0;
    let marginAppliedUsd = 0;
    let creditsCharged = 0;

    for (const node of nodes) {
      const nodeRaw = await this.estimateNodeRawCost(node);
      const calc = await this.calculateCredits(nodeRaw);
      nodeResults.push({ ...node, ...calc });
      rawCostUsd += calc.rawCostUsd;
      overheadUsd += calc.overheadUsd;
      marginAppliedUsd += calc.marginAppliedUsd;
      creditsCharged += calc.creditsCharged;
    }

    const config = await this.getConfig();
    const revenueUsd = creditsCharged * config.creditPriceUsd;
    const profitUsd = revenueUsd - rawCostUsd - overheadUsd;

    return {
      nodes: nodeResults,
      totals: {
        rawCostUsd,
        overheadUsd,
        marginAppliedUsd,
        creditsCharged,
        revenueUsd,
        profitUsd,
        profitPct: revenueUsd > 0 ? (profitUsd / revenueUsd) * 100 : 0,
      },
    };
  }
}
