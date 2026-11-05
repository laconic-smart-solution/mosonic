import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { tenancyFromLocalUser } from '../auth/tenancy.util';
import { User } from '../users/schemas/user.schema';
import { RuleMemoryService } from './rule-memory.service';
import { RuleService } from './rule.service';

@UseGuards(JwtAuthGuard)
@Controller('rules/:ruleId/memories')
export class RuleMemoryController {
  constructor(
    private readonly ruleService: RuleService,
    private readonly ruleMemoryService: RuleMemoryService,
  ) {}

  @Get()
  async list(@Req() req: Request, @Param('ruleId') ruleId: string) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    await this.ruleService.getRuleById(ruleId, auth);
    return this.ruleMemoryService.listForUi(ruleId, auth);
  }
}
