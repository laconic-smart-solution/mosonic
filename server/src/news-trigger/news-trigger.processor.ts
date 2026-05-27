import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Job } from 'bullmq';
import { Model } from 'mongoose';
import { startOfDayLocal, subHoursLocal } from './news-trigger-date.util';
import { EventsService } from '../events/events.service';
import {
  newsPipelineStartedNotification,
  newsRunCompletedNotification,
} from '../events/notification.util';
import { emitNewsRunUpdate } from './news-trigger-run-events';
import { summarizeNewsTriggerLog } from './news-trigger-run-summary.util';
import { OrchestrationService } from '../orchestration/orchestration.service';
import {
  Pipeline,
  PipelineStatus,
} from '../pipeline/schemas/pipeline.schema';
import {
  NewsTriggerSchedule,
  Rule,
  RuleStatus,
  type RuleDocument,
} from '../rule/schemas/rule.schema';
import { UserRole } from '../users/schemas/user.schema';
import { WorkflowResolveService } from '../workflow/workflow-resolve.service';
import {
  NEWS_TRIGGER_JOB_PROCESS_GROUP,
  NEWS_TRIGGER_JOB_PROCESS_SINGLE,
  NEWS_TRIGGER_QUEUE,
} from './news-trigger.constants';
import {
  NewsTriggerLog,
  type NewsTriggerLogDetail,
  type NewsTriggerLogDocument,
} from './schemas/news-trigger-log.schema';
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

@Processor(NEWS_TRIGGER_QUEUE)
@Injectable()
export class NewsTriggerProcessor extends WorkerHost {
  private readonly logger = new Logger(NewsTriggerProcessor.name);

  constructor(
    @InjectModel(Rule.name)
    private readonly ruleModel: Model<RuleDocument>,
    @InjectModel(NewsTriggerLog.name)
    private readonly logModel: Model<NewsTriggerLogDocument>,
    @InjectModel(Pipeline.name)
    private readonly pipelineModel: Model<Pipeline>,
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

    const log = await this.logModel.create({
      runId,
      group: groupKey,
      ranAt: new Date(),
    });

    const logDetails: NewsTriggerLogDetail[] = [];

    try {
      const eligibleRules = await this.loadEligibleRules(
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

      await log.updateOne({ articlesFetched: articles.length });

      if (!articles.length) {
        this.logger.log(`[NewsTrigger] no articles for group=${groupKey}`);
        return;
      }

      const topArticles = await this.newsPicker.pickTopArticles(articles, 2);
      await log.updateOne({ topArticlesPicked: topArticles.length });

      if (!topArticles.length) {
        this.logger.log('[NewsTrigger] picker returned no articles');
        return;
      }

      await log.updateOne({ rulesChecked: eligibleRules.length });

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

      await log.updateOne({
        rulesMatched: totalMatched,
        pipelinesTriggered: totalTriggered,
        details: logDetails,
      });

      this.logger.log(
        `[NewsTrigger] run=${runId} done. matched=${totalMatched} triggered=${totalTriggered}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await log.updateOne({ errorMessage: msg });
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

    let log = await this.logModel.findOne({ runId }).exec();
    if (!log) {
      this.logger.warn(
        `[NewsTrigger] pending log missing for run=${runId}, creating at worker`,
      );
      log = await this.logModel.create({
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
      const rule = await this.ruleModel.findOne({ ruleId }).lean().exec();
      if (!rule) {
        await this.finalizeManualRun(log, ruleId, userId, {
          errorMessage: 'rule not found',
          details: logDetails,
        });
        return;
      }

      if (rule.userId !== userId) {
        await this.finalizeManualRun(log, ruleId, userId, {
          errorMessage: 'userId mismatch',
          details: logDetails,
        });
        return;
      }

      if (rule.status !== RuleStatus.Active) {
        await this.finalizeManualRun(log, ruleId, userId, {
          errorMessage: 'rule not active',
          details: logDetails,
        });
        return;
      }

      const nt = rule.newsTrigger;
      const country = nt?.country ?? 'us';
      const language = nt?.language ?? 'en';
      const category = nt?.category ?? '';
      const keywords = (nt?.keywords ?? [])
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 5);

      await log.updateOne({ rulesChecked: 1 });

      const articles = await this.newsFetch.fetchTopArticles({
        country,
        language,
        category: category || undefined,
        keywords,
        limit: 10,
      });

      await log.updateOne({ articlesFetched: articles.length });

      if (!articles.length) {
        this.logger.log(`[NewsTrigger] manual: no articles for rule=${ruleId}`);
        await this.finalizeManualRun(log, ruleId, userId, { details: logDetails });
        return;
      }

      const topArticles = await this.newsPicker.pickTopArticles(articles, 2);
      await log.updateOne({ topArticlesPicked: topArticles.length });

      if (!topArticles.length) {
        await this.finalizeManualRun(log, ruleId, userId, { details: logDetails });
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
          rule as Rule,
          article,
          today,
          logDetails,
          lockOpts,
        );
        if (skip) continue;

        const result = await this.triggerPipelineForArticle(
          rule as Rule,
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

      await this.finalizeManualRun(log, ruleId, userId, {
        rulesMatched: totalMatched,
        pipelinesTriggered: totalTriggered,
        details: logDetails,
      });

      this.logger.log(
        `[NewsTrigger] manual run=${runId} done. triggered=${totalTriggered}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.finalizeManualRun(log, ruleId, userId, { errorMessage: msg });
      this.logger.error(`[NewsTrigger] manual run=${runId} failed: ${msg}`);
      throw err;
    }
  }

  private async finalizeManualRun(
    log: NewsTriggerLogDocument,
    ruleId: string,
    userId: string,
    patch: Record<string, unknown>,
  ): Promise<void> {
    const completedAt = new Date();
    const runId = log.runId;
    const updateResult = await this.logModel.updateOne(
      { runId },
      { ...patch, completedAt, ruleId },
    );
    this.logger.log(
      `[NewsTrigger] finalizeManualRun persisted run=${runId} matched=${updateResult.matchedCount} modified=${updateResult.modifiedCount}`,
    );

    if (!userId) return;

    const doc = await this.logModel.findOne({ runId }).lean().exec();
    if (!doc) {
      this.logger.error(
        `[NewsTrigger] finalizeManualRun log missing after update run=${runId}`,
      );
      return;
    }

    const summary = summarizeNewsTriggerLog(doc, ruleId);
    if (summary.status === 'running') {
      this.logger.warn(
        `[NewsTrigger] finalizeManualRun still running run=${log.runId} — skip emit`,
      );
      return;
    }

    this.logger.log(
      `[NewsTrigger] finalizeManualRun run=${log.runId} rule=${ruleId} ` +
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
    rule: Rule,
    article: PickedArticle,
    userId: string,
    logDetails: NewsTriggerLogDetail[],
    lockOpts: TriggerLockOpts,
  ): Promise<'triggered' | 'skipped'> {
    const relevance = await this.newsRelevance.checkRelevance(article, rule);

    const minScore = rule.newsTrigger?.minRelevanceScore ?? 70;
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
      rule,
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

    await this.ruleModel.updateOne(
      { ruleId: rule.ruleId },
      {
        'newsTrigger.lastTriggeredAt': new Date(),
        $inc: { 'newsTrigger.totalTriggeredCount': 1 },
      },
    );

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

  private async releaseLockIfNeeded(
    ruleId: string,
    lockOpts: TriggerLockOpts,
  ): Promise<void> {
    if (lockOpts.skipDailyLock) return;
    await this.lockService.releaseLock(ruleId, lockOpts.dayKey);
  }

  private async loadEligibleRules(
    country: string,
    language: string,
    category: string,
  ): Promise<Rule[]> {
    const today = startOfDayLocal(new Date());
    const eightHoursAgo = subHoursLocal(new Date(), 8);

    const docs = await this.ruleModel
      .find({
        'newsTrigger.enabled': true,
        'newsTrigger.country': country,
        'newsTrigger.language': language,
        'newsTrigger.category': category,
        status: RuleStatus.Active,
        $or: [
          { 'newsTrigger.lastTriggeredAt': null },
          {
            'newsTrigger.schedule': NewsTriggerSchedule.Daily,
            'newsTrigger.lastTriggeredAt': { $lt: today },
          },
          {
            'newsTrigger.schedule': NewsTriggerSchedule.TwiceDaily,
            'newsTrigger.lastTriggeredAt': { $lt: eightHoursAgo },
          },
        ],
      } as Record<string, unknown>)
      .lean()
      .exec();

    return docs as Rule[];
  }

  private mergeGroupKeywords(rules: Rule[]): string[] {
    const set = new Set<string>();
    for (const rule of rules) {
      for (const kw of rule.newsTrigger?.keywords ?? []) {
        const t = kw.trim().toLowerCase();
        if (t) set.add(t);
      }
    }
    return [...set].slice(0, 5);
  }

  private async evaluateRuleForTrigger(
    rule: Rule,
    article: PickedArticle,
    today: Date,
    logDetails: NewsTriggerLogDetail[],
    lockOpts: TriggerLockOpts,
  ): Promise<boolean> {
    const userId = rule.userId ?? '';

    if (!this.newsRelevance.keywordPreFilter(article, rule)) {
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

    const maxPosts = rule.newsTrigger?.maxPostsPerDay ?? 1;
    const newsCountToday = await this.pipelineModel.countDocuments({
      ruleRef: rule.ruleId,
      'metadata.source': 'news',
      startedAt: { $gte: today },
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
    const running = await this.pipelineModel.countDocuments({
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
