import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OrchestrationService } from '../orchestration/orchestration.service';
import { Pipeline, PipelineStatus } from '../pipeline/schemas/pipeline.schema';
import { Rule, RuleStatus, type RuleDocument } from '../rule/schemas/rule.schema';
import { UserRole } from '../users/schemas/user.schema';
import { WorkflowService } from '../workflow/workflow.service';
import { Workflow, WorkflowStatus } from '../workflow/schemas/workflow.schema';
import { computeNextRunAt } from './campaign-schedule.util';
import {
  CampaignSchedule,
  ContentPromptStrategy,
  type CampaignScheduleDocument,
} from './schemas/campaign-schedule.schema';

@Injectable()
export class CampaignSchedulerService {
  private readonly logger = new Logger(CampaignSchedulerService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectModel(CampaignSchedule.name)
    private readonly scheduleModel: Model<CampaignScheduleDocument>,
    @InjectModel(Rule.name)
    private readonly ruleModel: Model<RuleDocument>,
    @InjectModel(Workflow.name)
    private readonly workflowModel: Model<Workflow>,
    @InjectModel(Pipeline.name)
    private readonly pipelineModel: Model<Pipeline>,
    private readonly orchestration: OrchestrationService,
    private readonly workflowService: WorkflowService,
  ) {}

  @Cron('*/15 * * * *')
  async tick(): Promise<void> {
    const now = new Date();
    const due = await this.scheduleModel
      .find({ enabled: true, nextRunAt: { $lte: now } })
      .limit(50)
      .exec();

    for (const schedule of due) {
      try {
        await this.runSchedule(schedule);
      } catch (err) {
        this.logger.warn(
          `Schedule ${schedule.scheduleId} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        schedule.failureCount += 1;
        schedule.nextRunAt = new Date(
          Date.now() + Math.min(3600_000 * 2 ** schedule.failureCount, 86_400_000),
        );
        await schedule.save();
      }
    }
  }

  private async runSchedule(
    schedule: CampaignScheduleDocument,
  ): Promise<void> {
    const rule = await this.ruleModel
      .findOne({ ruleId: schedule.ruleRef })
      .exec();
    if (!rule || rule.status !== RuleStatus.Active) {
      schedule.enabled = false;
      await schedule.save();
      return;
    }

    const maxConcurrent = Number(
      this.config.get('SCHEDULER_MAX_CONCURRENT_PER_USER', 2),
    );
    const running = await this.pipelineModel.countDocuments({
      userId: schedule.userId,
      status: PipelineStatus.Running,
    });
    if (running >= maxConcurrent) {
      schedule.nextRunAt = new Date(Date.now() + 15 * 60_000);
      await schedule.save();
      return;
    }

    if (schedule.lastPipelineId) {
      const last = await this.pipelineModel
        .findOne({ pipelineId: schedule.lastPipelineId })
        .exec();
      if (last?.status === PipelineStatus.Running) {
        schedule.nextRunAt = new Date(Date.now() + 15 * 60_000);
        await schedule.save();
        return;
      }
    }

    const workflowId = await this.resolveWorkflowId(schedule);
    if (!workflowId) {
      schedule.nextRunAt = computeNextRunAt(
        rule.campaign.postingFrequency,
        rule.campaign.customSchedule,
      );
      await schedule.save();
      return;
    }

    const contentPrompt = this.pickContentPrompt(schedule);
    const { pipelineId } = await this.orchestration.startPipeline({
      workflowId,
      ruleId: rule.ruleId,
      contentPrompt,
      useLearnings: true,
      metadata: { source: 'scheduler', scheduleId: schedule.scheduleId },
      auth: { userId: schedule.userId, role: UserRole.CUSTOMER },
    });

    schedule.lastRunAt = new Date();
    schedule.lastPipelineId = pipelineId;
    schedule.failureCount = 0;
    schedule.nextRunAt = computeNextRunAt(
      rule.campaign.postingFrequency,
      rule.campaign.customSchedule,
    );
    await schedule.save();
  }

  private async resolveWorkflowId(
    schedule: CampaignScheduleDocument,
  ): Promise<string | null> {
    if (schedule.workflowRef) {
      const w = await this.workflowModel
        .findOne({ workflowId: schedule.workflowRef, status: WorkflowStatus.Ready })
        .exec();
      if (w) return w.workflowId;
    }
    if (schedule.workflowTemplateId) {
      const applied = await this.workflowService.applyTemplate(
        schedule.workflowTemplateId,
        schedule.ruleRef,
        { userId: schedule.userId, role: UserRole.CUSTOMER },
      );
      schedule.workflowRef = applied.workflowId;
      await schedule.save();
      return applied.workflowId;
    }
    const latest = await this.workflowModel
      .findOne({
        ruleRef: schedule.ruleRef,
        status: WorkflowStatus.Ready,
        isTemplate: false,
      })
      .sort({ updatedAt: -1 })
      .exec();
    return latest?.workflowId ?? null;
  }

  private pickContentPrompt(schedule: CampaignScheduleDocument): string {
    const prompts = schedule.contentPrompts.filter((p) => p.trim());
    if (prompts.length === 0) {
      return 'Scheduled campaign generation';
    }
    if (schedule.contentPromptStrategy === ContentPromptStrategy.Rotate) {
      const idx = Math.floor(Math.random() * prompts.length);
      return prompts[idx]!;
    }
    return prompts[0]!;
  }
}
