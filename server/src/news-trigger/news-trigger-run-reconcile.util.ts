import type { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import type { Model } from 'mongoose';
import type { NewsTriggerRunStatusDto } from './news-trigger-run-summary.util';
import { summarizeNewsTriggerLog } from './news-trigger-run-summary.util';
import type { NewsTriggerManualJobPayload } from './news-trigger.processor';
import type { NewsTriggerLogDocument } from './schemas/news-trigger-log.schema';

export async function reconcileRunningManualLog(
  logModel: Model<NewsTriggerLogDocument>,
  logger: Logger,
  ruleId: string,
  log: { runId: string; ranAt?: Date },
  bullJob: Job<NewsTriggerManualJobPayload> | undefined,
): Promise<NewsTriggerRunStatusDto | null> {
  if (!bullJob) return null;

  const bullState = await bullJob.getState();
  const jobRunId = bullJob.data?.runId;
  if (jobRunId !== log.runId) {
    logger.warn(
      `[NewsTrigger] bull job runId=${jobRunId} does not match log runId=${log.runId} — ignoring job state`,
    );
    return null;
  }

  const fresh = await logModel.findOne({ runId: log.runId }).lean().exec();
  if (fresh?.completedAt) {
    return summarizeNewsTriggerLog(fresh, ruleId);
  }

  if (bullState === 'completed') {
    const finishedAt = bullJob.finishedOn
      ? new Date(bullJob.finishedOn)
      : new Date();
    logger.error(
      `[NewsTrigger] repairing orphan log run=${log.runId} — Bull job completed but Mongo log has no completedAt`,
    );
    await logModel.updateOne(
      { runId: log.runId },
      {
        completedAt: finishedAt,
        errorMessage:
          'Run finished in the queue but the result was not saved. Check worker/API logs and try again.',
      },
    );
    const repaired = await logModel.findOne({ runId: log.runId }).lean().exec();
    return repaired ? summarizeNewsTriggerLog(repaired, ruleId) : null;
  }

  if (bullState === 'failed') {
    const finishedAt = bullJob.finishedOn
      ? new Date(bullJob.finishedOn)
      : new Date();
    const reason =
      bullJob.failedReason?.trim() ||
      'News run job failed in the queue. Check worker logs.';
    logger.error(
      `[NewsTrigger] repairing failed job log run=${log.runId}: ${reason}`,
    );
    await logModel.updateOne(
      { runId: log.runId },
      {
        completedAt: finishedAt,
        errorMessage: reason,
      },
    );
    const repaired = await logModel.findOne({ runId: log.runId }).lean().exec();
    return repaired ? summarizeNewsTriggerLog(repaired, ruleId) : null;
  }

  return null;
}
