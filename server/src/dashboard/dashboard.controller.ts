import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { tenancyFromLocalUser } from '../auth/tenancy.util';
import { User } from '../users/schemas/user.schema';
import type { DashboardResponseDto } from './dto/dashboard-response.dto';
import { DashboardService } from './dashboard.service';

@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  async getDashboard(@Req() req: Request): Promise<DashboardResponseDto> {
    const user = req.auth!.localUser as User;
    const auth = tenancyFromLocalUser(user);
    return this.dashboardService.getDashboard(auth);
  }
}

