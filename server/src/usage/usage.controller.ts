import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { tenancyFromLocalUser } from '../auth/tenancy.util';
import { User } from '../users/schemas/user.schema';
import { PurchaseHistoryQueryDto } from './dto/purchase-history-query.dto';
import { UsageHistoryQueryDto } from './dto/usage-history-query.dto';
import { UsageService } from './usage.service';

@UseGuards(JwtAuthGuard)
@Controller('usage')
@ApiTags('Usage')
@ApiBearerAuth('bearer')
export class UsageController {
  constructor(private readonly usageService: UsageService) {}

  @Get('history')
  getHistory(@Req() req: Request, @Query() query: UsageHistoryQueryDto) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.usageService.getUserHistory(auth.userId, {
      from: query.from,
      to: query.to,
      nodeType: query.nodeType,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
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

  @Get('purchases')
  getPurchaseHistory(
    @Req() req: Request,
    @Query() query: PurchaseHistoryQueryDto,
  ) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.usageService.getPurchaseHistory(auth.userId, {
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    });
  }
}
