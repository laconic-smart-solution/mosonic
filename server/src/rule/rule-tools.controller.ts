import { Body, Controller, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { tenancyFromLocalUser } from '../auth/tenancy.util';
import { User } from '../users/schemas/user.schema';
import { AskRuleToolsDto } from './dto/ask-rule-tools.dto';
import { RuleToolsService } from './rule-tools.service';

@UseGuards(JwtAuthGuard)
@Controller('rules/:ruleId/tools')
export class RuleToolsController {
  constructor(private readonly ruleToolsService: RuleToolsService) {}

  @Post('ask')
  ask(
    @Req() req: Request,
    @Param('ruleId') ruleId: string,
    @Body() body: AskRuleToolsDto,
  ) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.ruleToolsService.ask(ruleId, body.query, auth);
  }
}
