import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminGuard } from '../../auth/admin.guard';
import { UserRole, UserStatus } from '../../users/schemas/user.schema';
import { AdminCreateUserDto } from '../dto/admin-create-user.dto';
import { AdminUpdateRoleDto } from '../dto/admin-update-role.dto';
import { AdminUpdateStatusDto } from '../dto/admin-update-status.dto';
import { AdminUserProvisioningService } from '../services/admin-user-provisioning.service';
import { AdminUsersService } from '../services/admin-users.service';

const bodyPipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/users')
@ApiTags('Admin')
@ApiBearerAuth('bearer')
export class AdminUsersController {
  constructor(
    private readonly users: AdminUsersService,
    private readonly provisioning: AdminUserProvisioningService,
  ) {}

  @Get()
  listUsers(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('search') search?: string,
    @Query('status') status?: 'active' | 'suspended',
  ) {
    return this.users.listUsers({
      page: Number(page),
      limit: Number(limit),
      search,
      status,
    });
  }

  @Post()
  @UsePipes(bodyPipe)
  createUser(@Body() body: AdminCreateUserDto) {
    return this.provisioning.createUserViaSso(body);
  }

  @Put(':userId/suspend')
  suspendUser(@Param('userId') userId: string) {
    return this.users.suspendUser(userId);
  }

  @Put(':userId/reactivate')
  reactivateUser(@Param('userId') userId: string) {
    return this.users.reactivateUser(userId);
  }

  @Patch(':userId/role')
  @UsePipes(bodyPipe)
  updateRole(
    @Param('userId') userId: string,
    @Body() body: AdminUpdateRoleDto,
  ) {
    return this.provisioning.updateRole(userId, body.role);
  }

  @Patch(':userId/status')
  @UsePipes(bodyPipe)
  updateStatus(
    @Param('userId') userId: string,
    @Body() body: AdminUpdateStatusDto,
  ) {
    return this.provisioning.updateStatus(userId, body.status);
  }

  @Delete(':userId')
  deleteUser(@Param('userId') userId: string) {
    return this.provisioning.deleteUser(userId);
  }

  @Get(':userId')
  getUserDetail(@Param('userId') userId: string) {
    return this.users.getUserDetail(userId);
  }
}
