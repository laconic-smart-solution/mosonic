import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { tenancyFromLocalUser } from '../auth/tenancy.util';
import { User } from '../users/schemas/user.schema';
import { UsageService } from './usage.service';

@UseGuards(JwtAuthGuard)
@Controller('usage')
@ApiTags('Usage')
@ApiBearerAuth('bearer')
export class UsageController {
  constructor(private readonly usageService: UsageService) {}

  @Get('history')
  getHistory(
    @Req() req: Request,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('nodeType') nodeType?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.usageService.getUserHistory(auth.userId, {
      from,
      to,
      nodeType,
      page: Number(page),
      limit: Number(limit),
    });
  }

  @Get('summary')
  getSummary(@Req() req: Request) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.usageService.getUserSummary(auth.userId);
  }

  @Get('current-plan')
  getCurrentPlan(@Req() req: Request) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.usageService.getCurrentPlan(auth.userId);
  }
}
