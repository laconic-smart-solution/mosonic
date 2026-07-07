import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AdminGuard } from '../../auth/admin.guard';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import type { User } from '../../users/schemas/user.schema';
import { PaymentService } from '../../payment/payment.service';
import {
  AdminCreateTopupPlanDto,
  AdminUpdateTopupPlanActiveDto,
  AdminUpdateTopupPlanDto,
} from '../dto/admin-topup-plan.dto';

const bodyPipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

@Controller('admin/topup-plans')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiTags('Admin')
@ApiBearerAuth('bearer')
export class AdminTopupPlansController {
  constructor(private readonly paymentService: PaymentService) {}

  @Get()
  list() {
    return this.paymentService.listTopupPlans({ activeOnly: false });
  }

  @Post()
  @UsePipes(bodyPipe)
  create(@Body() body: AdminCreateTopupPlanDto, @Req() req: Request) {
    const user = req.auth!.localUser as User;
    return this.paymentService.createTopupPlan(body, user.userId);
  }

  @Put(':code')
  @UsePipes(bodyPipe)
  update(
    @Param('code') code: string,
    @Body() body: AdminUpdateTopupPlanDto,
    @Req() req: Request,
  ) {
    const user = req.auth!.localUser as User;
    return this.paymentService.updateTopupPlan(code, body, user.userId);
  }

  @Patch(':code/active')
  @UsePipes(bodyPipe)
  updateActive(
    @Param('code') code: string,
    @Body() body: AdminUpdateTopupPlanActiveDto,
    @Req() req: Request,
  ) {
    const user = req.auth!.localUser as User;
    return this.paymentService.setTopupPlanActive(code, body.active, user.userId);
  }
}
