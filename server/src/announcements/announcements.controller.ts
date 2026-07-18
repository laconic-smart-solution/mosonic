import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AnnouncementsService } from './announcements.service';
import { ListAnnouncementsQueryDto } from './dto/list-announcements-query.dto';

@UseGuards(JwtAuthGuard)
@Controller('announcements')
@ApiTags('Announcements')
@ApiBearerAuth('bearer')
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get('latest')
  @ApiOperation({
    summary: 'Latest published announcement for the global banner',
  })
  latest() {
    return this.announcements.getLatest();
  }

  @Get()
  @ApiOperation({ summary: 'List published announcements' })
  list(@Query() query: ListAnnouncementsQueryDto) {
    return this.announcements.list(query.page ?? 1, query.limit ?? 20);
  }
}
