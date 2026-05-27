import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { formatHourLocal } from './news-trigger-date.util';
import { Rule, type RuleDocument } from '../rule/schemas/rule.schema';
import {
  NEWS_TRIGGER_JOB_PROCESS_GROUP,
  NEWS_TRIGGER_QUEUE,
} from './news-trigger.constants';
import type { NewsTriggerGroupJobPayload } from './news-trigger.processor';

@Injectable()
export class NewsTriggerCron {
  private readonly logger = new Logger(NewsTriggerCron.name);

  constructor(
    @InjectModel(Rule.name)
    private readonly ruleModel: Model<RuleDocument>,
    @InjectQueue(NEWS_TRIGGER_QUEUE)
    private readonly queue: Queue<NewsTriggerGroupJobPayload>,
  ) {}

  /** 08:00 and 18:00 — server local timezone. */
  @Cron('0 8,18 * * *')
  async run(): Promise<void> {
    const now = new Date();
    const currentHour = formatHourLocal(now);
    const isMorning = currentHour === '08';

    this.logger.log(
      `[NewsTriggerCron] firing at ${currentHour}:00 (${isMorning ? 'morning' : 'evening'} run)`,
    );

    const scheduleQuery = isMorning
      ? { $in: ['daily', 'twice_daily'] as const }
      : 'twice_daily';

    const eligibleRules = await this.ruleModel
      .find({
        'newsTrigger.enabled': true,
        'newsTrigger.schedule': scheduleQuery,
      } as Record<string, unknown>)
      .select('newsTrigger.country newsTrigger.language newsTrigger.category')
      .lean()
      .exec();

    if (!eligibleRules.length) {
      this.logger.log('[NewsTriggerCron] no enabled rules found');
      return;
    }

    this.logger.log(
      `[NewsTriggerCron] ${eligibleRules.length} enabled rules found`,
    );

    const groups = new Map<
      string,
      { country: string; language: string; category: string }
    >();

    for (const rule of eligibleRules) {
      const nt = rule.newsTrigger;
      const key = `${nt.country}:${nt.language}:${nt.category ?? ''}`;
      if (!groups.has(key)) {
        groups.set(key, {
          country: nt.country,
          language: nt.language,
          category: nt.category ?? '',
        });
      }
    }

    this.logger.log(
      `[NewsTriggerCron] ${groups.size} unique news groups to process`,
    );

    for (const [key, params] of groups.entries()) {
      const runId = randomUUID();
      const jobId = `news_trigger:${key}:${now.toISOString().slice(0, 13)}`;

      await this.queue.add(
        NEWS_TRIGGER_JOB_PROCESS_GROUP,
        { runId, ...params },
        {
          jobId,
          attempts: 2,
          backoff: { type: 'fixed', delay: 5000 },
          removeOnComplete: { count: 100 },
          removeOnFail: { count: 50 },
        },
      );

      this.logger.log(`[NewsTriggerCron] enqueued group=${key} runId=${runId}`);
    }
  }
}
