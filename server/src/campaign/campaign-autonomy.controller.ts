import { Body, Controller, Get, Inject, Param, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { tenancyFromLocalUser } from '../auth/tenancy.util';
import type { ICampaignAutonomyPolicyRepository } from '../repositories/interfaces/campaign-autonomy-policy.repository.interface';
import { CAMPAIGN_AUTONOMY_POLICY_REPOSITORY } from '../repositories/tokens';
import { User } from '../users/schemas/user.schema';
import { AutonomyMode } from './schemas/campaign-autonomy-policy.schema';

@UseGuards(JwtAuthGuard)
@Controller('campaign/autonomy')
export class CampaignAutonomyController {
  constructor(
    @Inject(CAMPAIGN_AUTONOMY_POLICY_REPOSITORY)
    private readonly policies: ICampaignAutonomyPolicyRepository,
  ) {}

  @Get('rule/:ruleId')
  async getForRule(@Req() req: Request, @Param('ruleId') ruleId: string) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.policies.findByRuleRefScoped(ruleId, auth);
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
    return this.policies.upsert(ruleId, auth.userId, {
      enabled: body.enabled ?? false,
      mode: body.mode ?? AutonomyMode.Off,
      allowedChannels: body.allowedChannels ?? [],
      maxPostsPerDay: body.maxPostsPerDay ?? 5,
      blockIfPendingSuggestions: body.blockIfPendingSuggestions ?? true,
    });
  }
}
