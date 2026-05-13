import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminGuard } from '../../auth/admin.guard';
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
  getUserGrowth(@Query('days') days?: string) {
    return this.service.getUserGrowthChart(days ? Number(days) : 30);
  }

  @Get('pipeline-trend')
  getPipelineTrend(@Query('days') days?: string) {
    return this.service.getPipelineChart(days ? Number(days) : 30);
  }

  @Get('cost-trend')
  getCostTrend(@Query('days') days?: string) {
    return this.service.getCostChart(days ? Number(days) : 30);
  }

  @Get('node-types')
  getNodeTypes() {
    return this.service.getNodeTypeBreakdown();
  }

  @Get('channels')
  getChannels() {
    return this.service.getChannelBreakdown();
  }
}
