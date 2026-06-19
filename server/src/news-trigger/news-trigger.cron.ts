import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import type { IRuleRepository } from '../repositories/interfaces/rule.repository.interface';
import { RULE_REPOSITORY } from '../repositories/tokens';
import { formatHourLocal } from './news-trigger-date.util';
import {
  NEWS_TRIGGER_JOB_PROCESS_GROUP,
  NEWS_TRIGGER_QUEUE,
} from './news-trigger.constants';
import type { NewsTriggerGroupJobPayload } from './news-trigger.processor';

type NewsTriggerConfig = {
  country: string;
  language: string;
  category?: string;
};

@Injectable()
export class NewsTriggerCron {
  private readonly logger = new Logger(NewsTriggerCron.name);

  constructor(
    @Inject(RULE_REPOSITORY)
    private readonly rules: IRuleRepository,
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

    const eligibleRules = await this.rules.findNewsTriggerEligible(isMorning);

    if (!eligibleRules.length) {
      this.logger.log('[NewsTriggerCron] no enabled rules found');
      return;
    }

    this.logger.log(
      `[NewsTriggerCron] ${eligibleRules.length} enabled rules found`,
    );

    const groups = new Map<string, NewsTriggerConfig>();

    for (const rule of eligibleRules) {
      const nt = rule.newsTrigger as NewsTriggerConfig | null;
      if (!nt?.country || !nt?.language) continue;
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
        {
          runId,
          country: params.country,
          language: params.language,
          category: params.category ?? '',
        },
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
