import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminGuard } from '../../auth/admin.guard';
import { AdminContentService } from '../services/admin-content.service';

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/content')
@ApiTags('Admin')
@ApiBearerAuth('bearer')
export class AdminContentController {
  constructor(private readonly service: AdminContentService) {}

  @Get()
  listContent(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('status') status?: string,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.listContent({
      page: Number(page),
      limit: Number(limit),
      status,
      userId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }

  @Get(':contentId')
  getDetail(@Param('contentId') contentId: string) {
    return this.service.getContentDetail(contentId);
  }
}
