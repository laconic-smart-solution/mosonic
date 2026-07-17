import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AdminGuard } from '../../auth/admin.guard';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import type { UserRecord } from '../../domain/users/user.types';
import { AnnouncementLevel } from '@prisma/client';
import {
  AdminCreateAnnouncementDto,
  AdminListAnnouncementsQueryDto,
} from '../dto/admin-announcement.dto';
import { AdminAnnouncementsService } from '../services/admin-announcements.service';

const bodyPipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/announcements')
@ApiTags('Admin')
@ApiBearerAuth('bearer')
export class AdminAnnouncementsController {
  constructor(private readonly announcements: AdminAnnouncementsService) {}

  @Post()
  @UsePipes(bodyPipe)
  @ApiOperation({
    summary:
      'Publish an announcement: in-app notification to active users and/or LINE batch to connected users',
  })
  publish(@Body() body: AdminCreateAnnouncementDto, @Req() req: Request) {
    const admin = req.auth!.localUser as UserRecord;
    return this.announcements.publish({
      title: body.title,
      message: body.message,
      level: body.level ?? AnnouncementLevel.info,
      sendInApp: body.sendInApp ?? true,
      sendLine: body.sendLine ?? false,
      createdBy: admin.userId,
    });
  }

  @Get()
  @ApiOperation({ summary: 'List published announcements (history)' })
  list(@Query() query: AdminListAnnouncementsQueryDto) {
    return this.announcements.list(query.page ?? 1, query.limit ?? 20);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one announcement with delivery stats' })
  getById(@Param('id') id: string) {
    return this.announcements.getById(id);
  }
}
