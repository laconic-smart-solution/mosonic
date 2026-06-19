import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { OrchestrationService } from '../orchestration/orchestration.service';
import { PipelineStatus } from '../pipeline/schemas/pipeline.schema';
import type {
  CampaignScheduleRecord,
  ICampaignScheduleRepository,
} from '../repositories/interfaces/campaign-schedule.repository.interface';
import type { IPipelineRepository } from '../repositories/interfaces/pipeline.repository.interface';
import type { IRuleRepository } from '../repositories/interfaces/rule.repository.interface';
import type { IWorkflowRepository } from '../repositories/interfaces/workflow.repository.interface';
import {
  CAMPAIGN_SCHEDULE_REPOSITORY,
  PIPELINE_REPOSITORY,
  RULE_REPOSITORY,
  WORKFLOW_REPOSITORY,
} from '../repositories/tokens';
import { PostingFrequency, RuleStatus } from '../rule/schemas/rule.schema';
import { UserRole } from '../users/schemas/user.schema';
import { WorkflowService } from '../workflow/workflow.service';
import { computeNextRunAt } from './campaign-schedule.util';
import { ContentPromptStrategy } from './schemas/campaign-schedule.schema';

type RuleCampaign = {
  postingFrequency: PostingFrequency;
  customSchedule?: string | string[];
};

@Injectable()
export class CampaignSchedulerService {
  private readonly logger = new Logger(CampaignSchedulerService.name);

  constructor(
    private readonly config: ConfigService,
    @Inject(CAMPAIGN_SCHEDULE_REPOSITORY)
    private readonly schedules: ICampaignScheduleRepository,
    @Inject(RULE_REPOSITORY)
    private readonly rules: IRuleRepository,
    @Inject(WORKFLOW_REPOSITORY)
    private readonly workflows: IWorkflowRepository,
    @Inject(PIPELINE_REPOSITORY)
    private readonly pipelines: IPipelineRepository,
    private readonly orchestration: OrchestrationService,
    private readonly workflowService: WorkflowService,
  ) {}

  @Cron('*/15 * * * *')
  async tick(): Promise<void> {
    const now = new Date();
    const due = await this.schedules.findDue(now, 50);

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
        await this.schedules.save(schedule);
      }
    }
  }

  private async runSchedule(schedule: CampaignScheduleRecord): Promise<void> {
    const rule = await this.rules.findById(schedule.ruleRef);
    if (!rule || rule.status !== RuleStatus.Active) {
      schedule.enabled = false;
      await this.schedules.save(schedule);
      return;
    }

    const campaign = rule.campaign as RuleCampaign;
    const maxConcurrent = Number(
      this.config.get('SCHEDULER_MAX_CONCURRENT_PER_USER', 2),
    );
    const running = await this.pipelines.count({
      userId: schedule.userId,
      status: PipelineStatus.Running,
    });
    if (running >= maxConcurrent) {
      schedule.nextRunAt = new Date(Date.now() + 15 * 60_000);
      await this.schedules.save(schedule);
      return;
    }

    if (schedule.lastPipelineId) {
      const last = await this.pipelines.findById(schedule.lastPipelineId);
      if (last?.status === PipelineStatus.Running) {
        schedule.nextRunAt = new Date(Date.now() + 15 * 60_000);
        await this.schedules.save(schedule);
        return;
      }
    }

    const workflowId = await this.resolveWorkflowId(schedule);
    if (!workflowId) {
      schedule.nextRunAt = computeNextRunAt(
        campaign.postingFrequency,
        campaign.customSchedule,
      );
      await this.schedules.save(schedule);
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
      campaign.postingFrequency,
      campaign.customSchedule,
    );
    await this.schedules.save(schedule);
  }

  private async resolveWorkflowId(
    schedule: CampaignScheduleRecord,
  ): Promise<string | null> {
    if (schedule.workflowRef) {
      const w = await this.workflows.findReadyById(schedule.workflowRef);
      if (w) return w.workflowId;
    }
    if (schedule.workflowTemplateId) {
      const applied = await this.workflowService.applyTemplate(
        schedule.workflowTemplateId,
        schedule.ruleRef,
        { userId: schedule.userId, role: UserRole.CUSTOMER },
      );
      schedule.workflowRef = applied.workflowId;
      await this.schedules.save(schedule);
      return applied.workflowId;
    }
    const latest = await this.workflows.findLatestReadyByRule(schedule.ruleRef);
    return latest?.workflowId ?? null;
  }

  private pickContentPrompt(schedule: CampaignScheduleRecord): string {
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
