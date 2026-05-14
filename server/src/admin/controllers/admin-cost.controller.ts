import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminGuard } from '../../auth/admin.guard';
import { AdminCostService } from '../services/admin-cost.service';

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/cost')
@ApiTags('Admin')
@ApiBearerAuth('bearer')
export class AdminCostController {
  constructor(private readonly service: AdminCostService) {}

  @Get('summary')
  getSummary(@Query('from') from?: string, @Query('to') to?: string) {
    return this.service.getPlatformCostSummary(
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
  }

  @Get('month-over-month')
  getMonthOverMonth() {
    return this.service.getMonthOverMonth();
  }
}
