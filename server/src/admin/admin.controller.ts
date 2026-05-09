import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { UserRole, UserStatus } from '../users/schemas/user.schema';
import { AdminService } from './admin.service';
import { AdminCreateUserDto } from './dto/admin-create-user.dto';
import { AdminUpdateRoleDto } from './dto/admin-update-role.dto';
import { AdminUpdateStatusDto } from './dto/admin-update-status.dto';

const bodyPipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

@Controller('admin')
@ApiTags('Admin')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('stats/users')
  statsUsers() {
    return this.admin.statsUsers();
  }

  @Get('users')
  listUsers(
    @Query('q') q?: string,
    @Query('role') role?: UserRole,
    @Query('status') status?: UserStatus,
    @Query('page') pageRaw?: string,
    @Query('limit') limitRaw?: string,
  ) {
    const page = pageRaw ? Number(pageRaw) : undefined;
    const limit = limitRaw ? Number(limitRaw) : undefined;
    return this.admin.listUsers({ q, role, status, page, limit });
  }

  @Post('users')
  @UsePipes(bodyPipe)
  createUser(@Body() body: AdminCreateUserDto) {
    return this.admin.createUserViaSso(body);
  }

  @Patch('users/:userId/role')
  @UsePipes(bodyPipe)
  updateRole(
    @Param('userId') userId: string,
    @Body() body: AdminUpdateRoleDto,
  ) {
    return this.admin.updateRole(userId, body.role);
  }

  @Patch('users/:userId/status')
  @UsePipes(bodyPipe)
  updateStatus(
    @Param('userId') userId: string,
    @Body() body: AdminUpdateStatusDto,
  ) {
    return this.admin.updateStatus(userId, body.status);
  }

  @Delete('users/:userId')
  deleteUser(@Param('userId') userId: string) {
    return this.admin.deleteUser(userId);
  }
}
