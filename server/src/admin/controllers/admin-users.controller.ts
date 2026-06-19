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
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminGuard } from '../../auth/admin.guard';
import { CreditService } from '../../credit/credit.service';
import { User } from '../../users/schemas/user.schema';
import { AdminCreateUserDto } from '../dto/admin-create-user.dto';
import { AdminManualTopupDto } from '../dto/admin-manual-topup.dto';
import { AdminListUsersQueryDto } from '../dto/admin-query-ext.dto';
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
    private readonly creditService: CreditService,
  ) {}

  @Get()
  listUsers(@Query() query: AdminListUsersQueryDto) {
    return this.users.listUsers({
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      search: query.search,
      status: query.status,
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

  @Post(':userId/credits/topup')
  @UsePipes(bodyPipe)
  topupCredits(
    @Param('userId') userId: string,
    @Body() body: AdminManualTopupDto,
    @Req() req: Request,
  ) {
    const adminUserId = (req.auth!.localUser as User).userId;
    return this.creditService.adminManualTopup(
      userId,
      body.credits,
      adminUserId,
      body.reason,
    );
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
