import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../auth/admin.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AssignPlanDto } from './dto/assign-plan.dto';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { PlanService } from './plan.service';

const bodyPipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/plans')
@ApiTags('Admin')
@ApiBearerAuth('bearer')
export class PlanController {
  constructor(private readonly planService: PlanService) {}

  @Get()
  listPlans() {
    return this.planService.listPlans();
  }

  @Post()
  @UsePipes(bodyPipe)
  createPlan(@Body() body: CreatePlanDto) {
    return this.planService.createPlan(body);
  }

  @Put(':planId')
  @UsePipes(bodyPipe)
  updatePlan(@Param('planId') planId: string, @Body() body: UpdatePlanDto) {
    return this.planService.updatePlan(planId, body);
  }

  @Delete(':planId')
  deletePlan(@Param('planId') planId: string) {
    return this.planService.softDeletePlan(planId);
  }

  @Get(':planId/users')
  getPlanUsers(
    @Param('planId') planId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.planService.getPlanUsers(planId, Number(page), Number(limit));
  }

  @Post(':planId/assign')
  @UsePipes(bodyPipe)
  assignPlan(@Param('planId') planId: string, @Body() body: AssignPlanDto) {
    return this.planService.assignUserToPlan(planId, body.userId);
  }
}
