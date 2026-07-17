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
  AdminListLineConnectionsQueryDto,
  AdminSendLineMessageDto,
} from '../dto/admin-line.dto';
import { AdminLineService } from '../services/admin-line.service';

const bodyPipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/line')
@ApiTags('Admin')
@ApiBearerAuth('bearer')
export class AdminLineController {
  constructor(private readonly line: AdminLineService) {}

  @Get('connections')
  @ApiOperation({ summary: 'List users connected to LINE' })
  listConnections(@Query() query: AdminListLineConnectionsQueryDto) {
    return this.line.listConnections({
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      search: query.search,
    });
  }

  @Post('connections/:userId/messages')
  @UsePipes(bodyPipe)
  @ApiOperation({ summary: 'Send a LINE text message to one connected user' })
  sendMessage(
    @Param('userId') userId: string,
    @Body() body: AdminSendLineMessageDto,
  ) {
    return this.line.sendMessageToUser(userId, body.text);
  }

  @Post('announcements')
  @UsePipes(bodyPipe)
  @ApiOperation({
    summary:
      'Send a global LINE text announcement to all connected users (batch/multicast)',
  })
  announce(@Body() body: AdminSendLineMessageDto) {
    return this.line.announce(body.text);
  }
}
