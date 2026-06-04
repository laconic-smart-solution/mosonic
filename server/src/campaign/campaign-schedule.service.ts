import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { TenancyAuth } from '../auth/tenancy.types';
import { mergeUserIdFilter } from '../auth/tenancy.util';
import { Rule, type RuleDocument } from '../rule/schemas/rule.schema';
import { computeNextRunAt } from './campaign-schedule.util';
import {
  CampaignSchedule,
  ContentPromptStrategy,
  type CampaignScheduleDocument,
} from './schemas/campaign-schedule.schema';

@Injectable()
export class CampaignScheduleService {
  constructor(
    @InjectModel(CampaignSchedule.name)
    private readonly scheduleModel: Model<CampaignScheduleDocument>,
    @InjectModel(Rule.name)
    private readonly ruleModel: Model<RuleDocument>,
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
    const rule = await this.ruleModel
      .findOne(mergeUserIdFilter({ ruleId }, auth))
      .exec();
    if (!rule) {
      throw new NotFoundException(`Rule ${ruleId} not found`);
    }

    const nextRunAt = computeNextRunAt(
      rule.campaign.postingFrequency,
      rule.campaign.customSchedule,
    );

    const existing = await this.scheduleModel
      .findOne({ ruleRef: ruleId, userId: auth.userId })
      .exec();

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
      await existing.save();
      return existing.toObject();
    }

    const created = await this.scheduleModel.create({
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
    return created.toObject();
  }

  async getForRule(ruleId: string, auth: TenancyAuth) {
    return this.scheduleModel
      .findOne(mergeUserIdFilter({ ruleRef: ruleId }, auth))
      .lean()
      .exec();
  }

  async listUpcoming(auth: TenancyAuth, limit = 10) {
    return this.scheduleModel
      .find(
        mergeUserIdFilter({ enabled: true, nextRunAt: { $gte: new Date() } }, auth),
      )
      .sort({ nextRunAt: 1 })
      .limit(limit)
      .lean()
      .exec();
  }
}
