import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { Model } from 'mongoose';
import type { TenancyAuth } from '../auth/tenancy.types';
import { mergeUserIdFilter } from '../auth/tenancy.util';
import { EventsService } from '../events/events.service';
import {
  Pipeline,
  type PipelineDocument,
} from '../pipeline/schemas/pipeline.schema';
import { UsersService } from '../users/users.service';
import {
  OPENAI_IMAGE_PRICING,
  OPENAI_LLM_PRICING,
  OPENAI_VIDEO_PRICING,
  OPENAI_WHISPER_USD_PER_MINUTE,
  ZERNIO_ACCOUNT_MONTHLY_USD,
} from './cost.config';
import { RecordCostDto } from './dto/record-cost.dto';
import { PipelineBudgetExceededError } from './pipeline-budget-exceeded.error';
import { BudgetSettings, type BudgetSettingsDocument } from './schemas/budget-settings.schema';
import { CostEntry, type CostEntryDocument } from './schemas/cost-entry.schema';

@Injectable()
export class CostService {
  private readonly logger = new Logger(CostService.name);

  constructor(
    @InjectModel(CostEntry.name)
    private readonly costEntryModel: Model<CostEntryDocument>,
    @InjectModel(BudgetSettings.name)
    private readonly budgetModel: Model<BudgetSettingsDocument>,
    @InjectModel(Pipeline.name)
    private readonly pipelineModel: Model<PipelineDocument>,
    private readonly events: EventsService,
    private readonly usersService: UsersService,
  ) {}

  async recordNodeCost(dto: RecordCostDto): Promise<{ costUsd: number }> {
    const costUsd = dto.costUsdOverride ?? this.calculateCost(dto);

    const inputTokens = dto.inputTokens ?? 0;
    const outputTokens = dto.outputTokens ?? 0;

    await this.costEntryModel.create({
      userId: dto.userId,
      pipelineRef: dto.pipelineRef,
      campaignRef: dto.campaignRef,
      contentRef: dto.contentRef,
      nodeId: dto.nodeId,
      nodeType: dto.nodeType,
      provider: dto.provider,
      providerModel: dto.providerModel,
      entryType: dto.entryType,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      imageCount: dto.imageCount ?? 0,
      imageSize: dto.imageSize,
      imageQuality: dto.imageQuality,
      videoSeconds: dto.videoSeconds ?? 0,
      videoResolution: dto.videoResolution,
      accountCount: dto.accountCount ?? 0,
      costUsd,
      billingPeriod: this.currentBillingPeriod(),
    });

    this.logger.log(
      `Cost recorded: ${dto.entryType} | ${dto.providerModel ?? ''} | $${costUsd.toFixed(6)}`,
    );

    const budget = await this.checkBudgets(dto.userId, dto.pipelineRef);
    const shouldStop =
      (budget.runLimitHit && budget.onRunHit === 'stop') ||
      (budget.monthlyLimitHit && budget.onMonthlyHit === 'stop');

    if (shouldStop) {
      const scope = budget.runLimitHit ? 'run' : 'monthly';
      throw new PipelineBudgetExceededError(
        scope === 'run'
          ? 'This pipeline run exceeded your per-run cost limit.'
          : 'Your monthly AI cost limit has been reached.',
        scope,
      );
    }

    return { costUsd };
  }

  calculateCost(dto: RecordCostDto): number {
    switch (dto.entryType) {
      case 'openai_llm': {
        if (dto.providerModel === 'whisper-1') {
          const seconds = dto.audioDurationSeconds ?? 60;
          const minutes = Math.max(seconds / 60, 1 / 60);
          return minutes * OPENAI_WHISPER_USD_PER_MINUTE;
        }
        const p = dto.providerModel
          ? OPENAI_LLM_PRICING[dto.providerModel]
          : undefined;
        if (!p) {
          return 0;
        }
        return (
          ((dto.inputTokens ?? 0) / 1_000_000) * p.inputPerMToken +
          ((dto.outputTokens ?? 0) / 1_000_000) * p.outputPerMToken
        );
      }

      case 'openai_image': {
        const key = `${dto.providerModel}_${dto.imageSize}_${dto.imageQuality}`;
        let perImage = OPENAI_IMAGE_PRICING[key];
        if (perImage == null && dto.providerModel?.startsWith('gpt-image')) {
          perImage = OPENAI_IMAGE_PRICING['gpt-image-1_default'];
        }
        if (perImage == null) {
          this.logger.warn(
            `Unknown image pricing key "${key}"; recording $0 until pricing is configured`,
          );
          perImage = 0;
        }
        return perImage * (dto.imageCount ?? 1);
      }

      case 'openai_video': {
        const modelKey = dto.providerModel ?? 'sora-2';
        const p =
          OPENAI_VIDEO_PRICING[modelKey] ??
          OPENAI_VIDEO_PRICING['sora-2'] ??
          OPENAI_VIDEO_PRICING['sora'];
        if (!p) {
          return 0;
        }
        const perSecond =
          p.resolutions[dto.videoResolution ?? '720p'] ?? p.perSecond;
        return perSecond * (dto.videoSeconds ?? 0);
      }

      case 'zernio_account': {
        return ZERNIO_ACCOUNT_MONTHLY_USD * (dto.accountCount ?? 0);
      }

      default:
        return 0;
    }
  }

  async checkBudgets(
    userId: string,
    pipelineRef: string,
  ): Promise<{
    monthlyLimitHit: boolean;
    runLimitHit: boolean;
    onMonthlyHit?: 'warn' | 'stop';
    onRunHit?: 'warn' | 'stop';
  }> {
    const settings = await this.budgetModel.findOne({ userId }).lean();
    if (!settings) {
      return { monthlyLimitHit: false, runLimitHit: false };
    }

    const [monthlyTotal, runTotal] = await Promise.all([
      this.getMonthlyTotal(userId),
      this.getPipelineTotal(pipelineRef),
    ]);

    let monthlyLimitHit = false;
    let runLimitHit = false;

    if (settings.monthlyLimitUsd != null && settings.monthlyLimitUsd > 0) {
      const pct = (monthlyTotal / settings.monthlyLimitUsd) * 100;

      if (
        pct >= (settings.warningThresholdPct ?? 80) &&
        pct < 100 &&
        settings.inAppAlerts !== false
      ) {
        try {
          this.events.emitToPipeline(pipelineRef, 'cost:monthly_warning', {
            pipelineId: pipelineRef,
            userId,
            monthlyTotal,
            limitUsd: settings.monthlyLimitUsd,
            pct: Math.round(pct),
          });
        } catch {
          // Socket may be unavailable during startup/tests.
        }
      }

      if (monthlyTotal >= settings.monthlyLimitUsd) {
        monthlyLimitHit = true;
        if (settings.emailAlerts) {
          this.logger.warn(
            `cost.email placeholder: user ${userId} hit monthly limit (action=${settings.onMonthlyLimitHit})`,
          );
        }
        try {
          this.events.emitToPipeline(pipelineRef, 'cost:monthly_limit_hit', {
            pipelineId: pipelineRef,
            userId,
            action: settings.onMonthlyLimitHit,
          });
        } catch {
          // noop
        }
      }
    }

    if (
      settings.perRunLimitUsd != null &&
      settings.perRunLimitUsd > 0 &&
      runTotal >= settings.perRunLimitUsd
    ) {
      runLimitHit = true;
      if (settings.emailAlerts) {
        this.logger.warn(
          `cost.email placeholder: user ${userId} hit per-run limit on pipeline ${pipelineRef} (action=${settings.onRunLimitHit})`,
        );
      }
      try {
        this.events.emitToPipeline(pipelineRef, 'cost:run_limit_hit', {
          pipelineId: pipelineRef,
          userId,
          action: settings.onRunLimitHit,
        });
      } catch {
        // noop
      }
    }

    return {
      monthlyLimitHit,
      runLimitHit,
      onMonthlyHit: settings.onMonthlyLimitHit,
      onRunHit: settings.onRunLimitHit,
    };
  }

  async getDashboard(
    userId: string,
    from?: Date,
    to?: Date,
    campaignRef?: string,
  ) {
    const match: Record<string, unknown> = { userId };
    if (from != null || to != null) {
      const createdAt: { $gte?: Date; $lte?: Date } = {};
      if (from != null) {
        createdAt.$gte = from;
      }
      if (to != null) {
        createdAt.$lte = to;
      }
      match.createdAt = createdAt;
    }
    if (campaignRef) {
      match.campaignRef = campaignRef;
    }

    const entries = await this.costEntryModel.find(match).lean().exec();
    const plain = entries as unknown as Array<Record<string, unknown>>;

    const totalUsd = this.sum(plain, 'costUsd');
    const byProvider = this.groupSum(plain, 'provider');
    const byEntryType = this.groupSum(plain, 'entryType');
    const byNodeType = this.groupSum(plain, 'nodeType');
    const byCampaign = this.groupSum(plain, 'campaignRef');
    const byModel = this.groupSum(plain, 'providerModel');
    const byDay = this.groupByDay(plain);

    const monthlyTotal = await this.getMonthlyTotal(userId);
    const settings = await this.budgetModel.findOne({ userId }).lean();

    return {
      totalUsd,
      byProvider,
      byEntryType,
      byNodeType,
      byCampaign,
      byModel,
      byDay,
      monthly: {
        totalUsd: monthlyTotal,
        limitUsd: settings?.monthlyLimitUsd ?? null,
        usedPct:
          settings?.monthlyLimitUsd && settings.monthlyLimitUsd > 0
            ? Math.round((monthlyTotal / settings.monthlyLimitUsd) * 100)
            : null,
        warningPct: settings?.warningThresholdPct ?? 80,
      },
    };
  }

  async getPipelineBreakdown(pipelineRef: string, auth: TenancyAuth) {
    const owned = await this.pipelineModel
      .findOne(mergeUserIdFilter({ pipelineId: pipelineRef }, auth))
      .select({ pipelineId: 1 })
      .lean()
      .exec();
    if (!owned) {
      throw new NotFoundException(`Pipeline ${pipelineRef} not found`);
    }

    const entries = await this.costEntryModel
      .find({ pipelineRef })
      .sort({ createdAt: 1 })
      .lean()
      .exec();
    const plain = entries as unknown as Array<Record<string, unknown>>;

    return {
      totalUsd: this.sum(plain, 'costUsd'),
      byNodeType: this.groupSum(plain, 'nodeType'),
      byEntryType: this.groupSum(plain, 'entryType'),
      entries: entries.map((e) => ({
        nodeType: e.nodeType,
        model: e.providerModel,
        costUsd: e.costUsd,
        createdAt: (e as { createdAt?: Date }).createdAt,
      })),
    };
  }

  async getMonthlyTotal(userId: string): Promise<number> {
    const result = await this.costEntryModel
      .aggregate([
        { $match: { userId, billingPeriod: this.currentBillingPeriod() } },
        { $group: { _id: null, total: { $sum: '$costUsd' } } },
      ])
      .exec();
    return result[0]?.total ?? 0;
  }

  async getPipelineTotal(pipelineRef: string): Promise<number> {
    const result = await this.costEntryModel
      .aggregate([
        { $match: { pipelineRef } },
        { $group: { _id: null, total: { $sum: '$costUsd' } } },
      ])
      .exec();
    return result[0]?.total ?? 0;
  }

  async getBudgetSettings(userId: string) {
    const doc = await this.budgetModel.findOne({ userId }).lean().exec();
    return (
      doc ?? {
        userId,
        warningThresholdPct: 80,
        onMonthlyLimitHit: 'warn' as const,
        onRunLimitHit: 'stop' as const,
        emailAlerts: true,
        inAppAlerts: true,
      }
    );
  }

  async updateBudgetSettings(
    userId: string,
    dto: Partial<BudgetSettings>,
  ) {
    return this.budgetModel
      .findOneAndUpdate({ userId }, { ...dto }, { upsert: true, new: true })
      .lean()
      .exec();
  }

  currentBillingPeriod(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }

  /** First day of month in UTC `YYYY-MM` (stable id for monthly Zernio rows). */
  private monthlyKeyUtc(d: Date): string {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  @Cron('0 0 1 * *')
  async recordMonthlyZernioAccounts(): Promise<void> {
    this.logger.log('Recording monthly Zernio account costs…');
    let recorded = 0;
    const users =
      await this.usersService.listUserIdsWithZernioConnectedAccounts();
    const monthKey = this.monthlyKeyUtc(new Date());
    const billingPeriod = this.currentBillingPeriod();

    for (const { userId, accountCount } of users) {
      if (accountCount <= 0) {
        continue;
      }
      const pipelineRef = `zernio-monthly:${userId}:${monthKey}`;
      const existing = await this.costEntryModel
        .findOne({ userId, pipelineRef, billingPeriod })
        .select({ _id: 1 })
        .lean()
        .exec();
      if (existing) {
        continue;
      }
      try {
        await this.costEntryModel.create({
          userId,
          pipelineRef,
          campaignRef: `zernio-monthly:${monthKey}`,
          provider: 'zernio',
          providerModel: 'zernio_account',
          entryType: 'zernio_account',
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          imageCount: 0,
          videoSeconds: 0,
          accountCount,
          costUsd: ZERNIO_ACCOUNT_MONTHLY_USD * accountCount,
          billingPeriod,
        });
        recorded += 1;
      } catch (err) {
        this.logger.warn(
          `Zernio monthly cost row failed for ${userId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    this.logger.log(
      `Monthly Zernio account costs done: ${recorded} new rows (${users.length} users scanned)`,
    );
  }

  private sum(entries: Array<Record<string, unknown>>, field: string): number {
    return entries.reduce((acc, e) => acc + Number(e[field] ?? 0), 0);
  }

  private groupSum(
    entries: Array<Record<string, unknown>>,
    field: string,
  ): Record<string, number> {
    const acc: Record<string, number> = {};
    for (const e of entries) {
      const key = String(e[field] ?? 'unknown');
      const add = Number((e as { costUsd?: unknown }).costUsd ?? 0);
      acc[key] = (acc[key] ?? 0) + add;
    }
    return acc;
  }

  private groupByDay(
    entries: Array<Record<string, unknown>>,
  ): Record<string, number> {
    const acc: Record<string, number> = {};
    for (const e of entries) {
      const raw = (e as { createdAt?: Date }).createdAt;
      const day =
        raw instanceof Date && !Number.isNaN(raw.getTime())
          ? raw.toISOString().slice(0, 10)
          : 'unknown';
      const add = Number((e as { costUsd?: unknown }).costUsd ?? 0);
      acc[day] = (acc[day] ?? 0) + add;
    }
    return acc;
  }
}
