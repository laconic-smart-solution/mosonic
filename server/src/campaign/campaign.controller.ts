import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { tenancyFromLocalUser } from '../auth/tenancy.util';
import { User } from '../users/schemas/user.schema';
import { CampaignScheduleService } from './campaign-schedule.service';
import { UpsertCampaignScheduleDto } from './dto/upsert-campaign-schedule.dto';

@UseGuards(JwtAuthGuard)
@Controller('campaign')
export class CampaignController {
  constructor(private readonly schedules: CampaignScheduleService) {}

  @Get('schedules/upcoming')
  listUpcoming(@Req() req: Request) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.schedules.listUpcoming(auth);
  }

  @Get('schedules/rule/:ruleId')
  getForRule(@Req() req: Request, @Param('ruleId') ruleId: string) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.schedules.getForRule(ruleId, auth);
  }

  @Put('schedules/rule/:ruleId')
  upsert(
    @Req() req: Request,
    @Param('ruleId') ruleId: string,
    @Body() body: UpsertCampaignScheduleDto,
  ) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.schedules.upsertForRule(ruleId, body, auth);
  }
}
