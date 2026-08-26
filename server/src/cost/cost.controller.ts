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
import { CostService } from './cost.service';
import { UpdateBudgetSettingsDto } from './dto/budget-settings.dto';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import {
  parseDashboardFromIsoDay,
  parseDashboardToIsoDay,
} from './dashboard-date.util';

@UseGuards(JwtAuthGuard)
@Controller('cost')
export class CostController {
  constructor(private readonly costService: CostService) {}

  @Get('dashboard')
  async getDashboard(@Req() req: Request, @Query() query: DashboardQueryDto) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.costService.getDashboard(
      auth.userId,
      parseDashboardFromIsoDay(query.from),
      parseDashboardToIsoDay(query.to),
      query.campaignRef,
    );
  }

  @Get('monthly')
  async getMonthly(@Req() req: Request) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    const total = await this.costService.getMonthlyTotal(auth.userId);
    const settings = await this.costService.getBudgetSettings(auth.userId);
    const monthlyLimitUsd =
      'monthlyLimitUsd' in settings &&
      typeof (settings as { monthlyLimitUsd?: unknown }).monthlyLimitUsd ===
        'number'
        ? (settings as { monthlyLimitUsd: number }).monthlyLimitUsd
        : null;
    return {
      totalUsd: total,
      limitUsd: monthlyLimitUsd,
      usedPct:
        monthlyLimitUsd != null && monthlyLimitUsd > 0
          ? Math.round((total / monthlyLimitUsd) * 100)
          : null,
      billingPeriod: this.costService.currentBillingPeriod(),
    };
  }

  @Get('pipeline/:pipelineId')
  async getPipelineBreakdown(
    @Req() req: Request,
    @Param('pipelineId') pipelineId: string,
  ) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.costService.getPipelineBreakdown(pipelineId, auth);
  }

  @Get('budget')
  async getBudget(@Req() req: Request) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.costService.getBudgetSettings(auth.userId);
  }

  @Put('budget')
  async updateBudget(
    @Req() req: Request,
    @Body() dto: UpdateBudgetSettingsDto,
  ) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.costService.updateBudgetSettings(auth.userId, dto);
  }
}
