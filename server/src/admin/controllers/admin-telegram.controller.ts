import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../../auth/admin.guard';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import {
  AdminListTelegramConnectionsQueryDto,
  AdminSendTelegramMessageDto,
} from '../dto/admin-telegram.dto';
import { AdminTelegramService } from '../services/admin-telegram.service';

const bodyPipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/telegram')
@ApiTags('Admin')
@ApiBearerAuth('bearer')
export class AdminTelegramController {
  constructor(private readonly telegram: AdminTelegramService) {}

  @Get('connections')
  @ApiOperation({ summary: 'List users connected to Telegram' })
  listConnections(@Query() query: AdminListTelegramConnectionsQueryDto) {
    return this.telegram.listConnections({
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      search: query.search,
    });
  }

  @Post('connections/:userId/messages')
  @UsePipes(bodyPipe)
  @ApiOperation({
    summary: 'Send a Telegram text message to one connected user',
  })
  sendMessage(
    @Param('userId') userId: string,
    @Body() body: AdminSendTelegramMessageDto,
  ) {
    return this.telegram.sendMessageToUser(userId, body.text);
  }

  @Post('announcements')
  @UsePipes(bodyPipe)
  @ApiOperation({
    summary:
      'Send a global Telegram text announcement to all connected users (batch)',
  })
  announce(@Body() body: AdminSendTelegramMessageDto) {
    return this.telegram.announce(body.text);
  }
}
