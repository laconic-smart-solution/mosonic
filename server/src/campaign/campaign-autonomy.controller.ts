import { Body, Controller, Get, Param, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { mergeUserIdFilter } from '../auth/tenancy.util';
import { tenancyFromLocalUser } from '../auth/tenancy.util';
import { User } from '../users/schemas/user.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AutonomyMode,
  CampaignAutonomyPolicy,
  type CampaignAutonomyPolicyDocument,
} from './schemas/campaign-autonomy-policy.schema';

@UseGuards(JwtAuthGuard)
@Controller('campaign/autonomy')
export class CampaignAutonomyController {
  constructor(
    @InjectModel(CampaignAutonomyPolicy.name)
    private readonly policyModel: Model<CampaignAutonomyPolicyDocument>,
  ) {}

  @Get('rule/:ruleId')
  async getForRule(@Req() req: Request, @Param('ruleId') ruleId: string) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.policyModel
      .findOne(mergeUserIdFilter({ ruleRef: ruleId }, auth))
      .lean()
      .exec();
  }

  @Put('rule/:ruleId')
  async upsert(
    @Req() req: Request,
    @Param('ruleId') ruleId: string,
    @Body()
    body: {
      enabled?: boolean;
      mode?: AutonomyMode;
      allowedChannels?: string[];
      maxPostsPerDay?: number;
      blockIfPendingSuggestions?: boolean;
    },
  ) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    const existing = await this.policyModel
      .findOne({ ruleRef: ruleId, userId: auth.userId })
      .exec();
    if (existing) {
      Object.assign(existing, body);
      await existing.save();
      return existing.toObject();
    }
    const created = await this.policyModel.create({
      userId: auth.userId,
      ruleRef: ruleId,
      enabled: body.enabled ?? false,
      mode: body.mode ?? AutonomyMode.Off,
      allowedChannels: body.allowedChannels ?? [],
      maxPostsPerDay: body.maxPostsPerDay ?? 5,
      blockIfPendingSuggestions: body.blockIfPendingSuggestions ?? true,
    });
    return created.toObject();
  }
}
