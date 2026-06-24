import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import { Job } from 'bullmq';
import { startOfDayLocal } from './news-trigger-date.util';
import { EventsService } from '../events/events.service';
import {
  newsPipelineStartedNotification,
  newsRunCompletedNotification,
} from '../events/notification.util';
import { emitNewsRunUpdate } from './news-trigger-run-events';
import { summarizeNewsTriggerLog } from './news-trigger-run-summary.util';
import type { NewsTriggerLogLike } from './news-trigger-run-summary.util';
import { OrchestrationService } from '../orchestration/orchestration.service';
import { PipelineStatus } from '../pipeline/schemas/pipeline.schema';
import type { INewsTriggerLogRepository } from '../repositories/interfaces/news-trigger-log.repository.interface';
import type { IPipelineRepository } from '../repositories/interfaces/pipeline.repository.interface';
import type { IRuleRepository } from '../repositories/interfaces/rule.repository.interface';
import type { RuleRecord } from '../repositories/interfaces/rule.repository.interface';
import {
  NEWS_TRIGGER_LOG_REPOSITORY,
  PIPELINE_REPOSITORY,
  RULE_REPOSITORY,
} from '../repositories/tokens';
import { Rule, RuleStatus } from '../rule/schemas/rule.schema';
import { UserRole } from '../users/schemas/user.schema';
import { WorkflowResolveService } from '../workflow/workflow-resolve.service';
import {
  NEWS_TRIGGER_JOB_PROCESS_GROUP,
  NEWS_TRIGGER_JOB_PROCESS_SINGLE,
  NEWS_TRIGGER_QUEUE,
} from './news-trigger.constants';
import type { NewsTriggerLogDetail } from './schemas/news-trigger-log.schema';
import { NewsFetchService } from './services/news-fetch.service';
import {
  NewsPickerService,
  type PickedArticle,
} from './services/news-picker.service';
import { NewsPromptBuilderService } from './services/news-prompt-builder.service';
import { NewsRelevanceService } from './services/news-relevance.service';
import { NewsTriggerLockService } from './services/news-trigger-lock.service';

export interface NewsTriggerGroupJobPayload {
  runId: string;
  country: string;
  language: string;
  category: string;
}

export interface NewsTriggerManualJobPayload {
  runId: string;
  ruleId: string;
  userId: string;
}

type TriggerLockOpts = {
  skipDailyLock: boolean;
  dayKey: string;
};

type NewsTriggerConfig = {
  country?: string;
  language?: string;
  category?: string;
  keywords?: string[];
  minRelevanceScore?: number;
  maxPostsPerDay?: number;
};

/** How many GPT-ranked articles to evaluate per news run before skipping. */
const NEWS_TRIGGER_ARTICLE_CANDIDATE_COUNT = 5;

@Processor(NEWS_TRIGGER_QUEUE)
@Injectable()
export class NewsTriggerProcessor extends WorkerHost {
  private readonly logger = new Logger(NewsTriggerProcessor.name);

  constructor(
    @Inject(RULE_REPOSITORY)
    private readonly rules: IRuleRepository,
    @Inject(NEWS_TRIGGER_LOG_REPOSITORY)
    private readonly logs: INewsTriggerLogRepository,
    @Inject(PIPELINE_REPOSITORY)
    private readonly pipelines: IPipelineRepository,
    private readonly config: ConfigService,
    private readonly newsFetch: NewsFetchService,
    private readonly newsPicker: NewsPickerService,
    private readonly newsRelevance: NewsRelevanceService,
    private readonly promptBuilder: NewsPromptBuilderService,
    private readonly orchestration: OrchestrationService,
    private readonly workflowResolve: WorkflowResolveService,
    private readonly lockService: NewsTriggerLockService,
    private readonly events: EventsService,
  ) {
    super();
    this.logger.log(
      `[NewsTrigger] processor ready queue=${NEWS_TRIGGER_QUEUE} ` +
        `RUN_WORKERS_IN_API=${process.env.RUN_WORKERS_IN_API ?? 'unset'}`,
    );
  }

  @OnWorkerEvent('active')
  onActive(job: Job<NewsTriggerGroupJobPayload | NewsTriggerManualJobPayload>): void {
    const runId =
      'runId' in job.data ? job.data.runId : 'n/a';
    this.logger.log(
      `[NewsTrigger] worker active job=${job.name} id=${job.id} run=${runId}`,
    );
  }

  @OnWorkerEvent('failed')
  onFailed(
    job: Job<NewsTriggerGroupJobPayload | NewsTriggerManualJobPayload> | undefined,
    error: Error,
  ): void {
    this.logger.error(
      `[NewsTrigger] worker failed job=${job?.name ?? '?'} id=${job?.id ?? '?'}: ${error.message}`,
      error.stack,
    );
  }

  async process(
    job: Job<NewsTriggerGroupJobPayload | NewsTriggerManualJobPayload>,
  ): Promise<void> {
    if (job.name === NEWS_TRIGGER_JOB_PROCESS_SINGLE) {
      return this.processSingleRule(
        job as Job<NewsTriggerManualJobPayload>,
      );
    }
    return this.processNewsGroup(job as Job<NewsTriggerGroupJobPayload>);
  }

  private async processNewsGroup(
    job: Job<NewsTriggerGroupJobPayload>,
  ): Promise<void> {
    const { runId, country, language, category } = job.data;
    const groupKey = `${country}:${language}:${category}`;

    this.logger.log(`[NewsTrigger] run=${runId} group=${groupKey}`);

    await this.logs.create({
      runId,
      group: groupKey,
      ranAt: new Date(),
    });

    const logDetails: NewsTriggerLogDetail[] = [];

    try {
      const eligibleRules = await this.rules.findNewsTriggerGroupEligible(
        country,
        language,
        category,
      );

      const mergedKeywords = this.mergeGroupKeywords(eligibleRules);

      const articles = await this.newsFetch.fetchTopArticles({
        country,
        language,
        category: category || undefined,
        keywords: mergedKeywords,
        limit: 10,
      });

      await this.logs.updateByRunId(runId, { articlesFetched: articles.length });

      if (!articles.length) {
        this.logger.log(`[NewsTrigger] no articles for group=${groupKey}`);
        return;
      }

      const topArticles = await this.newsPicker.pickTopArticles(
        articles,
        NEWS_TRIGGER_ARTICLE_CANDIDATE_COUNT,
      );
      await this.logs.updateByRunId(runId, {
        topArticlesPicked: topArticles.length,
      });

      if (!topArticles.length) {
        this.logger.log('[NewsTrigger] picker returned no articles');
        return;
      }

      await this.logs.updateByRunId(runId, {
        rulesChecked: eligibleRules.length,
      });

      if (!eligibleRules.length) return;

      let totalMatched = 0;
      let totalTriggered = 0;
      const today = startOfDayLocal(new Date());
      const dayKey = today.toISOString().slice(0, 10);
      const lockOpts: TriggerLockOpts = { skipDailyLock: false, dayKey };

      for (const article of topArticles) {
        this.logger.log(
          `[NewsTrigger] processing article: "${article.title.slice(0, 60)}"`,
        );

        for (const rule of eligibleRules) {
          const userId = rule.userId ?? '';
          if (!userId) {
            logDetails.push({
              ruleId: rule.ruleId,
              userId: '',
              articleTitle: article.title,
              triggered: false,
              skipReason: 'missing userId',
            });
            continue;
          }

          const locked = await this.lockService.tryAcquireDailyLock(
            rule.ruleId,
            dayKey,
          );
          if (!locked) {
            logDetails.push({
              ruleId: rule.ruleId,
              userId,
              articleTitle: article.title,
              triggered: false,
              skipReason: 'already triggered today',
            });
            continue;
          }

          try {
            const skip = await this.evaluateRuleForTrigger(
              rule,
              article,
              today,
              logDetails,
              lockOpts,
            );
            if (skip) continue;

            const result = await this.triggerPipelineForArticle(
              rule,
              article,
              userId,
              logDetails,
              lockOpts,
            );
            if (result === 'triggered') {
              totalMatched++;
              totalTriggered++;
            }
          } catch (err) {
            await this.releaseLockIfNeeded(rule.ruleId, lockOpts);
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.warn(
              `[NewsTrigger] error processing rule=${rule.ruleId}: ${msg}`,
            );
            logDetails.push({
              ruleId: rule.ruleId,
              userId,
              articleTitle: article.title,
              triggered: false,
              skipReason: `error: ${msg}`,
            });
          }
        }
      }

      await this.logs.updateByRunId(runId, {
        rulesMatched: totalMatched,
        pipelinesTriggered: totalTriggered,
        details: logDetails as unknown as Prisma.InputJsonValue,
      });

      this.logger.log(
        `[NewsTrigger] run=${runId} done. matched=${totalMatched} triggered=${totalTriggered}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.logs.updateByRunId(runId, { errorMessage: msg });
      this.logger.error(`[NewsTrigger] run=${runId} failed: ${msg}`);
      throw err;
    }
  }

  private async processSingleRule(
    job: Job<NewsTriggerManualJobPayload>,
  ): Promise<void> {
    const { runId, ruleId, userId } = job.data;
    const groupKey = `manual:${ruleId}`;

    this.logger.log(
      `[NewsTrigger] manual run start run=${runId} rule=${ruleId} user=${userId}`,
    );

    let log = await this.logs.findByRunId(runId);
    if (!log) {
      this.logger.warn(
        `[NewsTrigger] pending log missing for run=${runId}, creating at worker`,
      );
      log = await this.logs.create({
        runId,
        group: groupKey,
        ruleId,
        ranAt: new Date(),
        completedAt: null,
      });
    } else {
      this.logger.log(`[NewsTrigger] using pending log run=${runId}`);
    }

    emitNewsRunUpdate(
      this.events,
      ruleId,
      summarizeNewsTriggerLog(
        {
          runId,
          completedAt: null,
          articlesFetched: 0,
          pipelinesTriggered: 0,
          details: [],
        },
        ruleId,
      ),
    );

    const logDetails: NewsTriggerLogDetail[] = [];

    try {
      const rule = await this.rules.findById(ruleId);
      if (!rule) {
        await this.finalizeManualRun(runId, ruleId, userId, {
          errorMessage: 'rule not found',
          details: logDetails,
        });
        return;
      }

      if (rule.userId !== userId) {
        await this.finalizeManualRun(runId, ruleId, userId, {
          errorMessage: 'userId mismatch',
          details: logDetails,
        });
        return;
      }

      if (rule.status !== RuleStatus.Active) {
        await this.finalizeManualRun(runId, ruleId, userId, {
          errorMessage: 'rule not active',
          details: logDetails,
        });
        return;
      }

      const nt = rule.newsTrigger as NewsTriggerConfig | null;
      const country = nt?.country ?? 'us';
      const language = nt?.language ?? 'en';
      const category = nt?.category ?? '';
      const keywords = (nt?.keywords ?? [])
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 5);

      await this.logs.updateByRunId(runId, { rulesChecked: 1 });

      const articles = await this.newsFetch.fetchTopArticles({
        country,
        language,
        category: category || undefined,
        keywords,
        limit: 10,
      });

      await this.logs.updateByRunId(runId, { articlesFetched: articles.length });

      if (!articles.length) {
        this.logger.log(`[NewsTrigger] manual: no articles for rule=${ruleId}`);
        await this.finalizeManualRun(runId, ruleId, userId, { details: logDetails });
        return;
      }

      const topArticles = await this.newsPicker.pickTopArticles(
        articles,
        NEWS_TRIGGER_ARTICLE_CANDIDATE_COUNT,
      );
      await this.logs.updateByRunId(runId, {
        topArticlesPicked: topArticles.length,
      });

      if (!topArticles.length) {
        await this.finalizeManualRun(runId, ruleId, userId, { details: logDetails });
        return;
      }

      const today = startOfDayLocal(new Date());
      const dayKey = today.toISOString().slice(0, 10);
      const lockOpts: TriggerLockOpts = { skipDailyLock: true, dayKey };

      let totalMatched = 0;
      let totalTriggered = 0;

      for (const article of topArticles) {
        this.logger.log(
          `[NewsTrigger] manual article: "${article.title.slice(0, 60)}"`,
        );

        const skip = await this.evaluateRuleForTrigger(
          rule,
          article,
          today,
          logDetails,
          lockOpts,
        );
        if (skip) continue;

        const result = await this.triggerPipelineForArticle(
          rule,
          article,
          userId,
          logDetails,
          lockOpts,
        );

        if (result === 'triggered') {
          totalMatched++;
          totalTriggered++;
          break;
        }
      }

      await this.finalizeManualRun(runId, ruleId, userId, {
        rulesMatched: totalMatched,
        pipelinesTriggered: totalTriggered,
        details: logDetails,
      });

      this.logger.log(
        `[NewsTrigger] manual run=${runId} done. triggered=${totalTriggered}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.finalizeManualRun(runId, ruleId, userId, { errorMessage: msg });
      this.logger.error(`[NewsTrigger] manual run=${runId} failed: ${msg}`);
      throw err;
    }
  }

  private async finalizeManualRun(
    runId: string,
    ruleId: string,
    userId: string,
    patch: {
      errorMessage?: string;
      rulesMatched?: number;
      pipelinesTriggered?: number;
      details?: NewsTriggerLogDetail[];
    },
  ): Promise<void> {
    const completedAt = new Date();
    const updated = await this.logs.updateByRunId(runId, {
      ...patch,
      details: patch.details as Prisma.InputJsonValue | undefined,
      completedAt,
      ruleId,
    });
    this.logger.log(
      `[NewsTrigger] finalizeManualRun persisted run=${runId} updated=${updated ? 'yes' : 'no'}`,
    );

    if (!userId) return;

    const doc = await this.logs.findByRunId(runId);
    if (!doc) {
      this.logger.error(
        `[NewsTrigger] finalizeManualRun log missing after update run=${runId}`,
      );
      return;
    }

    const summary = summarizeNewsTriggerLog(doc as unknown as NewsTriggerLogLike, ruleId);
    if (summary.status === 'running') {
      this.logger.warn(
        `[NewsTrigger] finalizeManualRun still running run=${runId} — skip emit`,
      );
      return;
    }

    this.logger.log(
      `[NewsTrigger] finalizeManualRun run=${runId} rule=${ruleId} ` +
        `status=${summary.status} outcome=${summary.outcome ?? 'n/a'} message="${summary.message.slice(0, 80)}"`,
    );

    emitNewsRunUpdate(this.events, ruleId, summary);

    if (summary.status === 'failed') {
      this.events.emitUserNotification({
        userId,
        sector: 'news',
        type: 'news.run_completed',
        title: 'News run failed',
        message: summary.message,
        data: {
          ...summary,
          ruleRef: ruleId,
        },
      });
      return;
    }

    const outcome =
      summary.outcome === 'triggered' ? 'triggered' : 'skipped';
    const notif = newsRunCompletedNotification({
      runId: summary.runId,
      ruleRef: ruleId,
      outcome,
      message: summary.message,
      pipelineId: summary.pipelineId,
      articleTitle: summary.articleTitle,
    });

    this.events.emitUserNotification({
      userId,
      sector: 'news',
      type: 'news.run_completed',
      title: notif.title,
      message: notif.message,
      data: { ...notif.data, ...summary, ruleRef: ruleId },
      action: notif.action,
    });
  }

  private async triggerPipelineForArticle(
    rule: RuleRecord,
    article: PickedArticle,
    userId: string,
    logDetails: NewsTriggerLogDetail[],
    lockOpts: TriggerLockOpts,
  ): Promise<'triggered' | 'skipped'> {
    const ruleForRelevance = rule as unknown as Rule;
    const relevance = await this.newsRelevance.checkRelevance(
      article,
      ruleForRelevance,
    );

    const nt = rule.newsTrigger as NewsTriggerConfig | null;
    const minScore = nt?.minRelevanceScore ?? 70;
    if (!relevance.compatible || relevance.score < minScore) {
      await this.releaseLockIfNeeded(rule.ruleId, lockOpts);
      logDetails.push({
        ruleId: rule.ruleId,
        userId,
        articleTitle: article.title,
        relevanceScore: relevance.score,
        triggered: false,
        skipReason: `score ${relevance.score} below threshold ${minScore}`,
      });
      return 'skipped';
    }

    const workflowId = await this.workflowResolve.resolveLatestReadyWorkflowId(
      rule.ruleId,
    );
    if (!workflowId) {
      await this.releaseLockIfNeeded(rule.ruleId, lockOpts);
      logDetails.push({
        ruleId: rule.ruleId,
        userId,
        articleTitle: article.title,
        relevanceScore: relevance.score,
        triggered: false,
        skipReason: 'no ready workflow',
      });
      return 'skipped';
    }

    const contentPrompt = this.promptBuilder.build({
      article,
      relevance,
      rule: ruleForRelevance,
    });

    const { pipelineId } = await this.orchestration.startPipeline({
      workflowId,
      ruleId: rule.ruleId,
      contentPrompt,
      useLearnings: true,
      metadata: {
        source: 'news',
        newsMeta: {
          title: article.title,
          url: article.link,
          sourceId: article.sourceId,
          publishedAt: article.pubDate,
          relevanceScore: relevance.score,
          suggestedAngle: relevance.suggestedAngle,
        },
      },
      auth: { userId, role: UserRole.CUSTOMER },
    });

    await this.recordNewsTriggerFired(rule.ruleId);

    const notif = newsPipelineStartedNotification({
      pipelineId,
      ruleRef: rule.ruleId,
      newsTitle: article.title,
      newsUrl: article.link,
      relevanceScore: relevance.score,
    });
    this.events.emitUserNotification({
      userId,
      sector: 'news',
      type: 'news.pipeline_started',
      title: notif.title,
      message: notif.message,
      data: notif.data,
      action: notif.action,
    });

    logDetails.push({
      ruleId: rule.ruleId,
      userId,
      articleTitle: article.title,
      relevanceScore: relevance.score,
      pipelineId,
      triggered: true,
    });

    this.logger.log(
      `[NewsTrigger] triggered pipeline=${pipelineId} rule=${rule.ruleId} score=${relevance.score}`,
    );

    return 'triggered';
  }

  private async recordNewsTriggerFired(ruleId: string): Promise<void> {
    const existing = await this.rules.findById(ruleId);
    if (!existing) return;
    const nt = (existing.newsTrigger ?? {}) as Record<string, unknown>;
    await this.rules.updateNewsTrigger(ruleId, {
      ...nt,
      lastTriggeredAt: new Date().toISOString(),
      totalTriggeredCount: Number(nt.totalTriggeredCount ?? 0) + 1,
    } as Prisma.InputJsonValue);
  }

  private async releaseLockIfNeeded(
    ruleId: string,
    lockOpts: TriggerLockOpts,
  ): Promise<void> {
    if (lockOpts.skipDailyLock) return;
    await this.lockService.releaseLock(ruleId, lockOpts.dayKey);
  }

  private mergeGroupKeywords(rules: RuleRecord[]): string[] {
    const set = new Set<string>();
    for (const rule of rules) {
      const nt = rule.newsTrigger as NewsTriggerConfig | null;
      for (const kw of nt?.keywords ?? []) {
        const t = kw.trim().toLowerCase();
        if (t) set.add(t);
      }
    }
    return [...set].slice(0, 5);
  }

  private async evaluateRuleForTrigger(
    rule: RuleRecord,
    article: PickedArticle,
    today: Date,
    logDetails: NewsTriggerLogDetail[],
    lockOpts: TriggerLockOpts,
  ): Promise<boolean> {
    const userId = rule.userId ?? '';
    const ruleForRelevance = rule as unknown as Rule;

    if (!this.newsRelevance.keywordPreFilter(article, ruleForRelevance)) {
      await this.releaseLockIfNeeded(rule.ruleId, lockOpts);
      logDetails.push({
        ruleId: rule.ruleId,
        userId,
        articleTitle: article.title,
        relevanceScore: 0,
        triggered: false,
        skipReason: 'keyword pre-filter failed',
      });
      return true;
    }

    const nt = rule.newsTrigger as NewsTriggerConfig | null;
    const maxPosts = nt?.maxPostsPerDay ?? 1;
    const newsCountToday = await this.pipelines.count({
      ruleRef: rule.ruleId,
      metadata: { path: ['source'], equals: 'news' },
      startedAt: { gte: today },
    });
    if (newsCountToday >= maxPosts) {
      await this.releaseLockIfNeeded(rule.ruleId, lockOpts);
      logDetails.push({
        ruleId: rule.ruleId,
        userId,
        articleTitle: article.title,
        triggered: false,
        skipReason: `max posts per day (${maxPosts}) reached`,
      });
      return true;
    }

    const maxConcurrent = Number(
      this.config.get('SCHEDULER_MAX_CONCURRENT_PER_USER', 2),
    );
    const running = await this.pipelines.count({
      userId,
      status: PipelineStatus.Running,
    });
    if (running >= maxConcurrent) {
      await this.releaseLockIfNeeded(rule.ruleId, lockOpts);
      logDetails.push({
        ruleId: rule.ruleId,
        userId,
        articleTitle: article.title,
        triggered: false,
        skipReason: 'max concurrent pipelines reached',
      });
      return true;
    }

    return false;
  }
}
