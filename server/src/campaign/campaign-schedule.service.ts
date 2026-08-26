import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { TenancyAuth } from '../auth/tenancy.types';
import type {
  CampaignScheduleRecord,
  ICampaignScheduleRepository,
} from '../repositories/interfaces/campaign-schedule.repository.interface';
import type { IRuleRepository } from '../repositories/interfaces/rule.repository.interface';
import {
  CAMPAIGN_SCHEDULE_REPOSITORY,
  RULE_REPOSITORY,
} from '../repositories/tokens';
import { PostingFrequency } from '../rule/schemas/rule.schema';
import { computeNextRunAt } from './campaign-schedule.util';
import { ContentPromptStrategy } from './schemas/campaign-schedule.schema';

type RuleCampaign = {
  postingFrequency: PostingFrequency;
  customSchedule?: string | string[];
};

@Injectable()
export class CampaignScheduleService {
  constructor(
    @Inject(CAMPAIGN_SCHEDULE_REPOSITORY)
    private readonly schedules: ICampaignScheduleRepository,
    @Inject(RULE_REPOSITORY)
    private readonly rules: IRuleRepository,
  ) {}

  async upsertForRule(
    ruleId: string,
    body: {
      enabled?: boolean;
      workflowTemplateId?: string | null;
      workflowRef?: string | null;
      contentPromptStrategy?: ContentPromptStrategy;
      contentPrompts?: string[];
      timezone?: string;
    },
    auth: TenancyAuth,
  ) {
    const rule = await this.rules.findById(ruleId, auth);
    if (!rule) {
      throw new NotFoundException(`Rule ${ruleId} not found`);
    }

    const campaign = rule.campaign as RuleCampaign;
    const nextRunAt = computeNextRunAt(
      campaign.postingFrequency,
      campaign.customSchedule,
    );

    const existing = await this.schedules.findByRule(ruleId, auth);

    if (existing) {
      if (body.enabled !== undefined) existing.enabled = body.enabled;
      if (body.workflowTemplateId !== undefined) {
        existing.workflowTemplateId = body.workflowTemplateId;
      }
      if (body.workflowRef !== undefined) {
        existing.workflowRef = body.workflowRef;
      }
      if (body.contentPromptStrategy) {
        existing.contentPromptStrategy = body.contentPromptStrategy;
      }
      if (body.contentPrompts) {
        existing.contentPrompts = body.contentPrompts;
      }
      if (body.timezone) {
        existing.timezone = body.timezone;
      }
      return this.schedules.save(existing);
    }

    return this.schedules.create({
      userId: auth.userId,
      ruleRef: ruleId,
      enabled: body.enabled ?? true,
      workflowTemplateId: body.workflowTemplateId ?? null,
      workflowRef: body.workflowRef ?? null,
      contentPromptStrategy:
        body.contentPromptStrategy ?? ContentPromptStrategy.Fixed,
      contentPrompts: body.contentPrompts ?? [],
      timezone: body.timezone ?? 'UTC',
      nextRunAt,
    });
  }

  async getForRule(ruleId: string, auth: TenancyAuth) {
    return this.schedules.findByRule(ruleId, auth);
  }

  async listUpcoming(auth: TenancyAuth, limit = 10) {
    return this.schedules.listUpcoming(auth, limit);
  }
}
