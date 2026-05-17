import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { TenancyAuth } from '../auth/tenancy.types';
import { mergeUserIdFilter } from '../auth/tenancy.util';
import { EventsService } from '../events/events.service';
import { ZernioRestClient } from '../mcp/zernio/zernio-rest.client';
import { Rule, type RuleDocument } from '../rule/schemas/rule.schema';
import { RuleService } from '../rule/rule.service';
import { Content, type ContentDocument } from '../content/schemas/content.schema';
import { Post, PostStatus, type PostDocument } from '../post/schemas/post.schema';
import {
  Upload,
  type UploadDocument,
} from '../upload/schemas/upload.schema';
import { SyncLock, type SyncLockDocument } from '../upload/sync-lock.schema';
import { ANALYTICS_WEEKLY_PULL_LOCK_ID } from './analytics-sync.constants';
import { AnalyticsFeedbackService } from './analytics-feedback.service';
import {
  aggregateMetrics,
  extractPostAnalyticsRows,
  formatAnalyticsPullSummary,
  type AnalyticsPullSummary,
} from './analytics-metrics.util';
import { AnalyticsRepository } from './analytics.repository';
import { deriveContentTitle, deriveUploadLabel } from './analytics-display.util';
import {
  FeedbackSignalStatus,
  type AnalyticsDocument,
  type ContentPerformanceEntry,
} from './schemas/analytics.schema';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectModel(SyncLock.name)
    private readonly syncLockModel: Model<SyncLockDocument>,
    @InjectModel(Post.name)
    private readonly postModel: Model<PostDocument>,
    @InjectModel(Content.name)
    private readonly contentModel: Model<ContentDocument>,
    @InjectModel(Upload.name) private readonly uploadModel: Model<UploadDocument>,
    @InjectModel(Rule.name) private readonly ruleModel: Model<RuleDocument>,
    private readonly analyticsRepository: AnalyticsRepository,
    private readonly analyticsFeedback: AnalyticsFeedbackService,
    private readonly zernioRest: ZernioRestClient,
    private readonly events: EventsService,
    @Inject(forwardRef(() => RuleService))
    private readonly ruleService: RuleService,
  ) {}

  async latestWithDisplay(
    ruleId: string,
    auth: TenancyAuth,
  ): Promise<{
    ruleName: string;
    analytics: AnalyticsDocument | null;
    display: {
      contentByRef: Record<string, { title: string }>;
      uploadByRef: Record<string, { label: string }>;
    };
  }> {
    const ruleName =
      (await this.analyticsRepository.getRuleName(ruleId, auth)) ?? 'Rule';

    const doc = await this.analyticsRepository.findByRuleRef(ruleId);
    if (!doc) {
      return {
        ruleName,
        analytics: null,
        display: { contentByRef: {}, uploadByRef: {} },
      };
    }

    const contentRefs = Array.from(
      new Set(
        (doc.contentPerformance ?? [])
          .map((e) => e.contentRef)
          .filter((s): s is string => typeof s === 'string' && s.trim().length > 0),
      ),
    );
    const uploadRefs = Array.from(
      new Set(
        (doc.contentPerformance ?? [])
          .map((e) => e.uploadRef)
          .filter((s): s is string => typeof s === 'string' && s.trim().length > 0),
      ),
    );

    const [contents, uploads] = await Promise.all([
      contentRefs.length
        ? this.contentModel
            .find(mergeUserIdFilter({ contentId: { $in: contentRefs } }, auth))
            .select({ contentId: 1, outputs: 1, userEdits: 1 })
            .lean()
            .exec()
        : Promise.resolve([]),
      uploadRefs.length
        ? this.uploadModel
            .find(mergeUserIdFilter({ uploadId: { $in: uploadRefs } }, auth))
            .select({ uploadId: 1, channels: 1 })
            .lean()
            .exec()
        : Promise.resolve([]),
    ]);

    const contentByRef: Record<string, { title: string }> = {};
    for (const c of contents as Array<Partial<Content> & { contentId?: string }>) {
      const ref = typeof c.contentId === 'string' ? c.contentId : '';
      if (!ref) continue;
      contentByRef[ref] = { title: deriveContentTitle(c) };
    }

    const uploadByRef: Record<string, { label: string }> = {};
    for (const u of uploads as Array<Partial<Upload> & { uploadId?: string }>) {
      const ref = typeof u.uploadId === 'string' ? u.uploadId : '';
      if (!ref) continue;
      uploadByRef[ref] = { label: deriveUploadLabel(u) };
    }

    return { ruleName, analytics: doc, display: { contentByRef, uploadByRef } };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async tryAcquireWeeklyLock(instanceId: string): Promise<boolean> {
    const leaseMs =
      Number(this.config.get('ANALYTICS_WEEKLY_PULL_LOCK_LEASE_MS')) ||
      600_000;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + leaseMs);

    const upserted = await this.syncLockModel
      .updateOne(
        { _id: ANALYTICS_WEEKLY_PULL_LOCK_ID },
        { $setOnInsert: { owner: instanceId, expiresAt } },
        { upsert: true },
      )
      .exec();
    if (upserted.upsertedCount > 0) return true;

    const stolen = await this.syncLockModel
      .updateOne(
        { _id: ANALYTICS_WEEKLY_PULL_LOCK_ID, expiresAt: { $lte: now } },
        { $set: { owner: instanceId, expiresAt } },
      )
      .exec();
    return stolen.modifiedCount > 0;
  }

  private async releaseWeeklyLock(): Promise<void> {
    await this.syncLockModel
      .deleteOne({ _id: ANALYTICS_WEEKLY_PULL_LOCK_ID })
      .exec();
  }

  @Cron('0 0 * * 1')
  async weeklyAnalyticsPull(): Promise<void> {
    this.logger.log('Starting weekly analytics pull...');
    const instanceId =
      this.config.get<string>('HOSTNAME')?.trim() || `pid-${process.pid}`;
    const acquired = await this.tryAcquireWeeklyLock(instanceId);
    if (!acquired) {
      this.logger.log('Analytics pull already running — skipping');
      return;
    }

    try {
      const ruleRefs = await this.analyticsRepository.distinctRuleRefs();

      for (const ruleRef of ruleRefs) {
        const rule = await this.ruleModel.findOne({ ruleId: ruleRef }).exec();
        if (!rule) continue;
        try {
          await this.pullAnalyticsForRule(rule, { emitStart: false });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.error(
            `Analytics pull failed for rule ${ruleRef}: ${msg}`,
          );
          if (!(err instanceof BadRequestException)) {
            this.events.emitToAnalyticsRule(ruleRef, 'analytics:pull_failed', {
              ruleId: ruleRef,
              message: msg,
            });
          }
        }
        await this.sleep(2000);
      }
    } finally {
      await this.releaseWeeklyLock();
    }

    this.logger.log('Weekly analytics pull complete.');
  }

  /**
   * Sync Zernio metrics for a rule, update the live doc in place, emit events.
   * @param emitStart when true, emit `analytics:pull_started` (manual refresh).
   */
  async pullAnalyticsForRule(
    rule: RuleDocument,
    options?: { emitStart?: boolean },
  ): Promise<{ doc: AnalyticsDocument; summary: AnalyticsPullSummary } | null> {
    const ruleRef = rule.ruleId;
    if (options?.emitStart !== false) {
      this.events.emitToAnalyticsRule(ruleRef, 'analytics:pull_started', {
        ruleId: ruleRef,
      });
    }

    const to = new Date();
    // Zernio defaults to 90 days when omitted; keep our stored period consistent.
    const from = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const posts = await this.postModel
      .find({
        ruleRef,
        status: {
          $in: [PostStatus.Published, PostStatus.Partial],
        },
        zernioPostId: { $exists: true, $nin: [null, ''] },
      })
      .select({
        contentRef: 1,
        uploadRef: 1,
        zernioPostId: 1,
        channels: 1,
      })
      .lean()
      .exec();

    if (!posts.length) {
      this.logger.debug(`No published/partial Zernio posts for ${ruleRef}`);
      this.events.emitToAnalyticsRule(ruleRef, 'analytics:pull_failed', {
        ruleId: ruleRef,
        message:
          'No published or partial posts with Zernio ids found for this rule.',
      });
      return null;
    }

    const uploadRefs = [
      ...new Set(
        posts
          .map((p) => String(p.uploadRef ?? '').trim())
          .filter((id) => id.length > 0),
      ),
    ];
    const uploadRows = uploadRefs.length
      ? await this.uploadModel
          .find({ uploadId: { $in: uploadRefs } })
          .select({ uploadId: 1, workflowRef: 1 })
          .lean()
          .exec()
      : [];
    const pipelineByUpload = new Map(
      uploadRows.map((u) => [String(u.uploadId), String(u.workflowRef ?? '')]),
    );

    const contentPerformance: ContentPerformanceEntry[] = [];
    const pullSummary: AnalyticsPullSummary = {
      postsQueried: posts.length,
      platformRowsSynced: 0,
      pending: 0,
      failed: 0,
      noData: 0,
    };

    for (const post of posts) {
      const pid = String(post.zernioPostId ?? '').trim();
      if (!pid) continue;
      const pipelineRef =
        pipelineByUpload.get(String(post.uploadRef)) ?? '';
      const chans = Array.isArray(post.channels)
        ? post.channels.map((c) => String(c ?? '').trim()).filter(Boolean)
        : [];

      if (chans.length === 0) continue;

      let raw: unknown | null;
      try {
        raw = await this.zernioRest.getPostAnalytics(pid, {
          fromDate: from.toISOString().slice(0, 10),
          toDate: to.toISOString().slice(0, 10),
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Failed to get analytics for post ${pid}: ${msg}`);
        pullSummary.failed += chans.length;
        await this.sleep(500);
        continue;
      }

      if (raw == null) {
        pullSummary.pending += chans.length;
        await this.sleep(500);
        continue;
      }

      const extracted = extractPostAnalyticsRows(raw, chans);
      pullSummary.pending += extracted.pending.length;
      pullSummary.failed += extracted.failed.length;
      pullSummary.noData += extracted.noData.length;

      for (const row of extracted.synced) {
        contentPerformance.push({
          contentRef: String(post.contentRef ?? ''),
          pipelineRef,
          uploadRef: String(post.uploadRef ?? ''),
          zernioPostId: pid,
          channel: row.channel,
          metrics: row.metrics,
        });
        pullSummary.platformRowsSynced += 1;
      }

      await this.sleep(500);
    }

    if (!contentPerformance.length) {
      const message = formatAnalyticsPullSummary(pullSummary);
      this.events.emitToAnalyticsRule(ruleRef, 'analytics:pull_failed', {
        ruleId: ruleRef,
        message,
        summary: pullSummary,
      });
      throw new BadRequestException(message);
    }

    const campaignSummary = aggregateMetrics(contentPerformance);
    const pulledAt = new Date();

    // Ensure the doc exists (covers legacy rules created before placeholder).
    const doc = await this.analyticsRepository.ensureForRule(ruleRef);
    await this.analyticsRepository.updateMetrics(ruleRef, {
      contentPerformance,
      campaignSummary,
      period: { from, to },
      pulledAt,
    });

    const updated =
      (await this.analyticsRepository.findByRuleRef(ruleRef)) ?? doc;

    const message = formatAnalyticsPullSummary(pullSummary);
    this.events.emitToAnalyticsRule(ruleRef, 'analytics:pull_completed', {
      analyticsId: updated.analyticsId,
      ruleRef,
      summary: pullSummary,
      message,
    });

    return { doc: updated, summary: pullSummary };
  }

  /**
   * Create the analytics doc for a rule the first time the rule is created.
   * Idempotent and safe to call multiple times.
   */
  async ensureForRule(ruleRef: string): Promise<AnalyticsDocument | null> {
    const id = ruleRef?.trim();
    if (!id) return null;
    return this.analyticsRepository.ensureForRule(id);
  }

  /**
   * Run the LLM feedback pass on the rule's analytics doc and persist
   * the resulting suggestions. Emits `analytics:suggestion_ready` when any
   * suggestions are produced.
   */
  async generateSuggestions(
    analyticsId: string,
    auth: TenancyAuth,
  ): Promise<{ analyticsId: string; suggestionCount: number }> {
    const doc = await this.analyticsRepository.findByAnalyticsId(analyticsId);
    if (!doc) {
      throw new NotFoundException('Analytics not found');
    }
    const owns = await this.analyticsRepository.assertUserOwnsRule(
      doc.ruleRef,
      auth,
    );
    if (!owns) {
      throw new NotFoundException('Analytics not found');
    }
    const rule = await this.ruleModel
      .findOne(mergeUserIdFilter({ ruleId: doc.ruleRef }, auth))
      .exec();
    if (!rule) {
      throw new NotFoundException('Rule not found');
    }
    if (!doc.contentPerformance?.length) {
      throw new BadRequestException(
        'No analytics data available. Sync analytics first.',
      );
    }

    const feedbackSignal = await this.analyticsFeedback.analyze(
      rule,
      doc.contentPerformance,
      doc.campaignSummary,
    );

    await this.analyticsRepository.updateFeedbackSignal(
      analyticsId,
      feedbackSignal,
    );

    if (feedbackSignal.suggestions.length > 0) {
      this.events.emitToAnalyticsRule(doc.ruleRef, 'analytics:suggestion_ready', {
        analyticsId: doc.analyticsId,
        ruleRef: doc.ruleRef,
        count: feedbackSignal.suggestions.length,
      });
    }

    return {
      analyticsId: doc.analyticsId,
      suggestionCount: feedbackSignal.suggestions.length,
    };
  }

  async manualPull(
    ruleId: string,
    auth: TenancyAuth,
  ): Promise<{
    analyticsId: string;
    message: string;
    summary: AnalyticsPullSummary;
  }> {
    const allowed = await this.analyticsRepository.assertUserOwnsRule(
      ruleId,
      auth,
    );
    if (!allowed) {
      throw new NotFoundException('Rule not found');
    }
    const rule = await this.ruleModel
      .findOne(mergeUserIdFilter({ ruleId }, auth))
      .exec();
    if (!rule) {
      throw new NotFoundException('Rule not found');
    }

    this.events.emitToAnalyticsRule(ruleId, 'analytics:pull_started', {
      ruleId,
    });

    try {
      const result = await this.pullAnalyticsForRule(rule, { emitStart: false });
      if (!result) {
        throw new BadRequestException(
          'No published or partial posts with Zernio ids found for this rule.',
        );
      }
      return {
        analyticsId: result.doc.analyticsId,
        message: formatAnalyticsPullSummary(result.summary),
        summary: result.summary,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!(err instanceof BadRequestException)) {
        this.events.emitToAnalyticsRule(ruleId, 'analytics:pull_failed', {
          ruleId,
          message: msg,
        });
      }
      throw err;
    }
  }

  async applySuggestion(
    analyticsId: string,
    suggestionIndex: number,
    auth: TenancyAuth,
  ): Promise<void> {
    const doc = await this.analyticsRepository.findByAnalyticsId(analyticsId);
    if (!doc) {
      throw new NotFoundException('Analytics not found');
    }
    const owns = await this.analyticsRepository.assertUserOwnsRule(
      doc.ruleRef,
      auth,
    );
    if (!owns) {
      throw new NotFoundException('Analytics not found');
    }

    const suggestion = doc.feedbackSignal?.suggestions?.[suggestionIndex];
    if (!suggestion) {
      throw new NotFoundException('Suggestion not found');
    }
    if (suggestion.status !== FeedbackSignalStatus.Pending) {
      throw new BadRequestException('Suggestion already processed');
    }

    await this.ruleService.applySuggestionFieldPatch(
      doc.ruleRef,
      suggestion.field.trim(),
      suggestion.suggestedValue,
      auth,
    );

    const ok = await this.analyticsRepository.updateSuggestionStatus(
      analyticsId,
      suggestionIndex,
      FeedbackSignalStatus.Applied,
    );
    if (!ok) {
      throw new BadRequestException('Could not update suggestion status');
    }
  }

  async rejectSuggestion(
    analyticsId: string,
    suggestionIndex: number,
    auth: TenancyAuth,
  ): Promise<void> {
    const doc = await this.analyticsRepository.findByAnalyticsId(analyticsId);
    if (!doc) {
      throw new NotFoundException('Analytics not found');
    }
    const owns = await this.analyticsRepository.assertUserOwnsRule(
      doc.ruleRef,
      auth,
    );
    if (!owns) {
      throw new NotFoundException('Analytics not found');
    }

    const suggestion = doc.feedbackSignal?.suggestions?.[suggestionIndex];
    if (!suggestion) {
      throw new NotFoundException('Suggestion not found');
    }
    if (suggestion.status !== FeedbackSignalStatus.Pending) {
      throw new BadRequestException('Suggestion already processed');
    }

    const ok = await this.analyticsRepository.updateSuggestionStatus(
      analyticsId,
      suggestionIndex,
      FeedbackSignalStatus.Rejected,
    );
    if (!ok) {
      throw new BadRequestException('Could not update suggestion status');
    }
  }
}
