import {
  Controller,
  Get,
  HttpCode,
  Logger,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { tenancyFromLocalUser } from '../auth/tenancy.util';
import { User } from '../users/schemas/user.schema';
import { NewsTriggerManualService } from './news-trigger-manual.service';
import { NewsTriggerRunService } from './news-trigger-run.service';

/** Mounted under `rules` to keep the public API path unchanged. */
@UseGuards(JwtAuthGuard)
@Controller('rules')
export class NewsTriggerController {
  private readonly logger = new Logger(NewsTriggerController.name);

  constructor(
    private readonly newsTriggerManual: NewsTriggerManualService,
    private readonly newsTriggerRun: NewsTriggerRunService,
  ) {}

  @Get(':ruleId/news-trigger/runs/latest')
  getLatestRun(@Req() req: Request, @Param('ruleId') ruleId: string) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    this.logger.log(`GET latest manual run rule=${ruleId} user=${auth.userId}`);
    return this.newsTriggerRun.getLatestManualRun(ruleId, auth);
  }

  @Get(':ruleId/news-trigger/runs/:runId')
  getRun(
    @Req() req: Request,
    @Param('ruleId') ruleId: string,
    @Param('runId') runId: string,
  ) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.newsTriggerRun.getRunById(ruleId, runId, auth);
  }

  @Post(':ruleId/news-trigger/run')
  @HttpCode(202)
  triggerNewsRun(@Req() req: Request, @Param('ruleId') ruleId: string) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    this.logger.log(`POST manual news run rule=${ruleId} user=${auth.userId}`);
    return this.newsTriggerManual.enqueueManualRun(ruleId, auth);
  }
}
