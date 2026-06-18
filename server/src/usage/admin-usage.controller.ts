import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../auth/admin.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsageService } from './usage.service';

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/usage')
@ApiTags('Admin')
@ApiBearerAuth('bearer')
export class AdminUsageController {
  constructor(private readonly usageService: UsageService) {}

  @Get('history')
  getHistory(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('userId') userId?: string,
    @Query('nodeType') nodeType?: string,
    @Query('provider') provider?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.usageService.getAdminHistory({
      from,
      to,
      userId,
      nodeType,
      provider,
      page: Number(page),
      limit: Number(limit),
    });
  }

  @Get('summary')
  getSummary(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('userId') userId?: string,
  ) {
    return this.usageService.getAdminSummary({ from, to, userId });
  }

  @Get('user/:userId')
  getUserHistory(
    @Param('userId') userId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.usageService.getAdminUserHistory(userId, {
      from,
      to,
      page: Number(page),
      limit: Number(limit),
    });
  }
}
