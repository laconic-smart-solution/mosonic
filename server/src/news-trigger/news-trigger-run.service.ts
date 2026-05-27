import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Queue } from 'bullmq';
import { Model } from 'mongoose';
import type { TenancyAuth } from '../auth/tenancy.types';
import { mergeUserIdFilter } from '../auth/tenancy.util';
import { Rule, type RuleDocument } from '../rule/schemas/rule.schema';
import type { NewsTriggerRunStatusDto } from './news-trigger-run-summary.util';
import {
  manualRunGroupKey,
  pendingRunStatus,
  summarizeNewsTriggerLog,
} from './news-trigger-run-summary.util';
import { NEWS_TRIGGER_QUEUE } from './news-trigger.constants';
import { findManualJobForRun } from './news-trigger-manual-job.util';
import { logNewsTriggerQueueState, workersInApiProcessLabel } from './news-trigger-queue-diagnostics.util';
import { reconcileRunningManualLog } from './news-trigger-run-reconcile.util';
import {
  NewsTriggerLog,
  type NewsTriggerLogDocument,
} from './schemas/news-trigger-log.schema';

@Injectable()
export class NewsTriggerRunService {
  private readonly logger = new Logger(NewsTriggerRunService.name);

  constructor(
    @InjectModel(Rule.name)
    private readonly ruleModel: Model<RuleDocument>,
    @InjectModel(NewsTriggerLog.name)
    private readonly logModel: Model<NewsTriggerLogDocument>,
    @InjectQueue(NEWS_TRIGGER_QUEUE)
    private readonly queue: Queue,
  ) {}

  async getLatestManualRun(
    ruleId: string,
    auth: TenancyAuth,
  ): Promise<NewsTriggerRunStatusDto | null> {
    await this.assertRuleAccess(ruleId, auth);

    const log = await this.logModel
      .findOne({ group: manualRunGroupKey(ruleId) })
      .sort({ ranAt: -1 })
      .lean()
      .exec();

    if (!log) {
      this.logger.debug(`[NewsTrigger] getLatestManualRun rule=${ruleId} — no logs`);
      return null;
    }

    const summary = summarizeNewsTriggerLog(log, ruleId);
    if (summary.status !== 'running') {
      this.logger.debug(
        `[NewsTrigger] getLatestManualRun rule=${ruleId} run=${log.runId} status=${summary.status}`,
      );
      return summary;
    }

    const ranAt = log.ranAt ? new Date(log.ranAt).getTime() : NaN;
    const ageMs = Number.isFinite(ranAt) ? Date.now() - ranAt : -1;
    const bullJob = await findManualJobForRun(this.queue, log.runId);
    const bullState = bullJob ? await bullJob.getState() : 'none';
    const bullJobRunId = bullJob?.data?.runId ?? 'n/a';

    this.logger.log(
      `[NewsTrigger] getLatestManualRun rule=${ruleId} logRun=${log.runId} ` +
        `ageMs=${ageMs} bullJob=${bullJob?.id ?? 'none'} bullState=${bullState} ` +
        `bullRun=${bullJobRunId} RUN_WORKERS_IN_API=${workersInApiProcessLabel()}`,
    );

    const reconciled = await reconcileRunningManualLog(
      this.logModel,
      this.logger,
      ruleId,
      log,
      bullJob,
    );
    if (reconciled) {
      return reconciled;
    }

    if (
      bullJob &&
      bullJob.data.runId === log.runId &&
      (bullState === 'waiting' ||
        bullState === 'active' ||
        bullState === 'delayed')
    ) {
      return summary;
    }

    const staleMs = 90 * 1000;
    if (Number.isFinite(ranAt) && ageMs > staleMs) {
      const counts = await logNewsTriggerQueueState(
        this.queue,
        this.logger,
        `stale manual run=${log.runId}`,
      );
      this.logger.warn(
        `[NewsTrigger] marking run=${log.runId} stale rule=${ruleId} ` +
          `ageMs=${ageMs} bullJob=${bullJob?.id ?? 'none'} bullState=${bullState} ` +
          `counts=${JSON.stringify(counts)}`,
      );
      const noJobHint =
        bullState === 'none'
          ? 'No matching Bull job found for this run (queue may have evicted it).'
          : `Bull job state=${bullState} for run=${bullJobRunId}.`;
      return {
        ...summary,
        status: 'failed',
        message:
          `Run did not finish (queued ${Math.round(ageMs / 1000)}s ago). ${noJobHint} ` +
          `Ensure API and worker use the same REDIS_* and MONGODB_URI, then try Run now again.`,
        completedAt: new Date().toISOString(),
      };
    }

    return summary;
  }

  async getRunById(
    ruleId: string,
    runId: string,
    auth: TenancyAuth,
  ): Promise<NewsTriggerRunStatusDto> {
    await this.assertRuleAccess(ruleId, auth);

    const log = await this.logModel.findOne({ runId }).lean().exec();
    if (!log) {
      return pendingRunStatus(runId);
    }

    if (log.group !== manualRunGroupKey(ruleId)) {
      throw new NotFoundException(`Run ${runId} not found for this campaign`);
    }

    return summarizeNewsTriggerLog(log, ruleId);
  }

  private async assertRuleAccess(
    ruleId: string,
    auth: TenancyAuth,
  ): Promise<void> {
    const rule = await this.ruleModel
      .findOne(mergeUserIdFilter({ ruleId }, auth))
      .select('ruleId')
      .lean()
      .exec();
    if (!rule) {
      throw new NotFoundException(`Rule ${ruleId} not found`);
    }
  }
}
