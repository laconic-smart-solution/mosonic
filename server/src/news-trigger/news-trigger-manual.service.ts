import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { Queue } from 'bullmq';
import { Model } from 'mongoose';
import { randomUUID } from 'node:crypto';
import type { TenancyAuth } from '../auth/tenancy.types';
import { mergeUserIdFilter } from '../auth/tenancy.util';
import {
  Rule,
  RuleStatus,
  type RuleDocument,
} from '../rule/schemas/rule.schema';
import { EventsService } from '../events/events.service';
import { WorkflowResolveService } from '../workflow/workflow-resolve.service';
import { emitNewsRunUpdate } from './news-trigger-run-events';
import { logNewsTriggerQueueState, workersInApiProcessLabel } from './news-trigger-queue-diagnostics.util';
import {
  manualRunGroupKey,
  pendingRunStatus,
} from './news-trigger-run-summary.util';
import {
  NewsTriggerLog,
  type NewsTriggerLogDocument,
} from './schemas/news-trigger-log.schema';
import {
  NEWS_TRIGGER_JOB_PROCESS_SINGLE,
  NEWS_TRIGGER_QUEUE,
  newsTriggerManualJobId,
} from './news-trigger.constants';
import { findInFlightManualJobForRule } from './news-trigger-manual-job.util';
import type { NewsTriggerManualJobPayload } from './news-trigger.processor';

export type NewsTriggerRunQueuedResponse = {
  runId: string;
  status: 'queued';
};

@Injectable()
export class NewsTriggerManualService {
  private readonly logger = new Logger(NewsTriggerManualService.name);

  constructor(
    @InjectModel(Rule.name)
    private readonly ruleModel: Model<RuleDocument>,
    @InjectModel(NewsTriggerLog.name)
    private readonly logModel: Model<NewsTriggerLogDocument>,
    @InjectQueue(NEWS_TRIGGER_QUEUE)
    private readonly queue: Queue<NewsTriggerManualJobPayload>,
    private readonly workflowResolve: WorkflowResolveService,
    private readonly events: EventsService,
  ) {}

  async enqueueManualRun(
    ruleId: string,
    auth: TenancyAuth,
  ): Promise<NewsTriggerRunQueuedResponse> {
    const rule = await this.ruleModel
      .findOne(mergeUserIdFilter({ ruleId }, auth))
      .exec();

    if (!rule) {
      throw new NotFoundException(`Rule ${ruleId} not found`);
    }

    if (rule.status !== RuleStatus.Active) {
      throw new BadRequestException(
        'Campaign must be active before running news generation.',
      );
    }

    const userId = rule.userId ?? auth.userId;
    if (!userId) {
      throw new BadRequestException('Rule has no associated user.');
    }

    const workflowId = await this.workflowResolve.resolveLatestReadyWorkflowId(
      ruleId,
    );
    if (!workflowId) {
      throw new BadRequestException(
        'No ready workflow found for this campaign. Save a workflow first.',
      );
    }

    const inFlight = await findInFlightManualJobForRule(this.queue, ruleId);
    if (inFlight) {
      const state = await inFlight.getState();
      this.logger.warn(
        `[NewsTrigger] manual run blocked rule=${ruleId} inFlightJob=${inFlight.id} state=${state} run=${inFlight.data.runId}`,
      );
      throw new ConflictException(
        'A news run is already in progress for this campaign',
      );
    }

    const runId = randomUUID();
    const jobId = newsTriggerManualJobId(ruleId, runId);
    const workersInApi = workersInApiProcessLabel();

    await this.logModel.create({
      runId,
      group: manualRunGroupKey(ruleId),
      ruleId,
      ranAt: new Date(),
      completedAt: null,
    });

    const added = await this.queue.add(
      NEWS_TRIGGER_JOB_PROCESS_SINGLE,
      { runId, ruleId, userId },
      {
        jobId,
        attempts: 2,
        backoff: { type: 'fixed', delay: 5000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      },
    );

    const addedState = await added.getState();
    const counts = await logNewsTriggerQueueState(
      this.queue,
      this.logger,
      `enqueued manual run=${runId}`,
    );

    this.logger.log(
      `[NewsTrigger] manual run queued run=${runId} rule=${ruleId} user=${userId} ` +
        `jobId=${jobId} bullState=${addedState} RUN_WORKERS_IN_API=${workersInApi}`,
    );

    if (workersInApi === 'false') {
      this.logger.warn(
        `[NewsTrigger] RUN_WORKERS_IN_API=false — start the separate worker process ` +
          `or jobs for run=${runId} will not execute`,
      );
    }

    emitNewsRunUpdate(this.events, ruleId, pendingRunStatus(runId));

    return { runId, status: 'queued' };
  }
}
