import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'node:crypto';
import type { TenancyAuth } from '../auth/tenancy.types';
import { mergeUserIdFilter } from '../auth/tenancy.util';
import { Rule } from '../rule/schemas/rule.schema';
import { aggregateMetrics } from './analytics-metrics.util';
import {
  Analytics,
  type AnalyticsDocument,
  type CampaignSummary,
  type ContentPerformanceEntry,
  type FeedbackSignal,
  FeedbackSignalStatus,
} from './schemas/analytics.schema';

const PENDING = FeedbackSignalStatus.Pending;

@Injectable()
export class AnalyticsRepository {
  constructor(
    @InjectModel(Analytics.name)
    private readonly analyticsModel: Model<AnalyticsDocument>,
    @InjectModel(Rule.name) private readonly ruleModel: Model<unknown>,
  ) {}

  private async visibleRuleIds(auth: TenancyAuth): Promise<string[]> {
    const filter = mergeUserIdFilter({}, auth);
    const ids = await this.ruleModel.distinct('ruleId', filter).exec();
    return (ids as string[]).filter(
      (id) => typeof id === 'string' && id.length > 0,
    );
  }

  /**
   * Idempotently create the analytics document for a rule. Returns the existing
   * doc when one already exists.
   */
  async ensureForRule(ruleRef: string): Promise<AnalyticsDocument> {
    const now = new Date();
    const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const existing = await this.analyticsModel.findOne({ ruleRef }).exec();
    if (existing) return existing;

    return this.analyticsModel.create({
      analyticsId: randomUUID(),
      ruleRef,
      period: { from, to: now },
      pulledAt: now,
      contentPerformance: [],
      campaignSummary: aggregateMetrics([]),
      feedbackSignal: { suggestions: [] },
    });
  }

  async findByAnalyticsId(
    analyticsId: string,
  ): Promise<AnalyticsDocument | null> {
    return this.analyticsModel.findOne({ analyticsId }).exec();
  }

  async findByRuleRef(ruleRef: string): Promise<AnalyticsDocument | null> {
    return this.analyticsModel.findOne({ ruleRef }).exec();
  }

  async listForRules(
    auth: TenancyAuth,
    options: { page: number; limit: number; ruleId?: string },
  ): Promise<{ items: AnalyticsDocument[]; total: number }> {
    const ruleIds = await this.visibleRuleIds(auth);
    let allowed = ruleIds;
    if (options.ruleId?.trim()) {
      const r = options.ruleId.trim();
      if (!allowed.includes(r)) {
        return { items: [], total: 0 };
      }
      allowed = [r];
    }
    if (allowed.length === 0) {
      return { items: [], total: 0 };
    }

    const filter = { ruleRef: { $in: allowed } };
    const [items, total] = await Promise.all([
      this.analyticsModel
        .find(filter)
        .sort({ pulledAt: -1 })
        .skip((options.page - 1) * options.limit)
        .limit(options.limit)
        .exec(),
      this.analyticsModel.countDocuments(filter).exec(),
    ]);
    return { items, total };
  }

  async countPendingSuggestionsForRules(
    auth: TenancyAuth,
  ): Promise<number> {
    const allowed = await this.visibleRuleIds(auth);
    if (allowed.length === 0) return 0;
    return this.countPendingPipeline({ ruleRef: { $in: allowed } });
  }

  async countPendingSuggestionsAll(): Promise<number> {
    return this.countPendingPipeline({});
  }

  private async countPendingPipeline(
    match: Record<string, unknown>,
  ): Promise<number> {
    const pipeline = [
      { $match: match },
      {
        $project: {
          pending: {
            $size: {
              $filter: {
                input: { $ifNull: ['$feedbackSignal.suggestions', []] },
                as: 's',
                cond: { $eq: ['$$s.status', PENDING] },
              },
            },
          },
        },
      },
      { $group: { _id: null, total: { $sum: '$pending' } } },
    ];
    const res = await this.analyticsModel.aggregate(pipeline).exec();
    const first = res[0] as { total?: number } | undefined;
    return typeof first?.total === 'number' ? first.total : 0;
  }

  async updateMetrics(
    ruleRef: string,
    payload: {
      contentPerformance: ContentPerformanceEntry[];
      campaignSummary: CampaignSummary;
      period: { from: Date; to: Date };
      pulledAt: Date;
    },
  ): Promise<boolean> {
    const res = await this.analyticsModel
      .updateOne(
        { ruleRef },
        {
          $set: {
            contentPerformance: payload.contentPerformance,
            campaignSummary: payload.campaignSummary,
            period: payload.period,
            pulledAt: payload.pulledAt,
          },
        },
      )
      .exec();
    return res.matchedCount > 0;
  }

  async updateSuggestionStatus(
    analyticsId: string,
    index: number,
    status: FeedbackSignalStatus,
  ): Promise<boolean> {
    if (index < 0) return false;
    const path = `feedbackSignal.suggestions.${index}.status`;
    const res = await this.analyticsModel
      .updateOne({ analyticsId }, { $set: { [path]: status } })
      .exec();
    return res.modifiedCount > 0;
  }

  async updateFeedbackSignal(
    analyticsId: string,
    feedbackSignal: FeedbackSignal,
  ): Promise<boolean> {
    const res = await this.analyticsModel
      .updateOne({ analyticsId }, { $set: { feedbackSignal } })
      .exec();
    return res.matchedCount > 0;
  }

  async deleteByRuleRef(ruleRef: string): Promise<number> {
    const res = await this.analyticsModel.deleteOne({ ruleRef }).exec();
    return res.deletedCount ?? 0;
  }

  async distinctRuleRefs(): Promise<string[]> {
    const ids = await this.analyticsModel.distinct('ruleRef').exec();
    return (ids as string[]).filter(
      (id) => typeof id === 'string' && id.length > 0,
    );
  }

  async assertUserOwnsRule(
    ruleRef: string,
    auth: TenancyAuth,
  ): Promise<boolean> {
    const rule = await this.ruleModel
      .findOne(mergeUserIdFilter({ ruleId: ruleRef }, auth))
      .select({ ruleId: 1 })
      .lean()
      .exec();
    return Boolean(rule);
  }

  async getRuleName(
    ruleRef: string,
    auth: TenancyAuth,
  ): Promise<string | null> {
    const doc = await this.ruleModel
      .findOne(mergeUserIdFilter({ ruleId: ruleRef }, auth))
      .select({ name: 1 })
      .lean()
      .exec();
    const r = doc as { name?: string } | null;
    return typeof r?.name === 'string' ? r.name : null;
  }

  pendingCountOnDoc(doc: AnalyticsDocument | null): number {
    if (!doc?.feedbackSignal?.suggestions?.length) return 0;
    return doc.feedbackSignal.suggestions.filter((s) => s.status === PENDING)
      .length;
  }
}
