import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminGuard } from '../../auth/admin.guard';
import { AdminChartDaysQueryDto } from '../dto/admin-query-ext.dto';
import { AdminDashboardService } from '../services/admin-dashboard.service';

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/dashboard')
@ApiTags('Admin')
@ApiBearerAuth('bearer')
export class AdminDashboardController {
  constructor(private readonly service: AdminDashboardService) {}

  @Get('overview')
  getOverview() {
    return this.service.getOverview();
  }

  @Get('user-growth')
  getUserGrowth(@Query() query: AdminChartDaysQueryDto) {
    return this.service.getUserGrowthChart(query.days ?? 30);
  }

  @Get('pipeline-trend')
  getPipelineTrend(@Query() query: AdminChartDaysQueryDto) {
    return this.service.getPipelineChart(query.days ?? 30);
  }

  @Get('cost-trend')
  getCostTrend(@Query() query: AdminChartDaysQueryDto) {
    return this.service.getCostChart(query.days ?? 30);
  }

  @Get('node-types')
  getNodeTypes() {
    return this.service.getNodeTypeBreakdown();
  }

  @Get('channels')
  getChannels() {
    return this.service.getChannelBreakdown();
  }

  @Get('pipeline-slo')
  getPipelineSlo(@Query() query: AdminChartDaysQueryDto) {
    return this.service.getPipelineSlo(query.days ?? 7);
  }
}
