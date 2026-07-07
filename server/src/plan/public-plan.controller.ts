import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { tenancyFromLocalUser } from '../auth/tenancy.util';
import { User } from '../users/schemas/user.schema';
import { InitiatePlanUpgradeDto } from './dto/initiate-plan-upgrade.dto';
import { PlanUpgradeService } from './plan-upgrade.service';
import { PlanService } from './plan.service';

const bodyPipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

@Controller('plans')
@ApiTags('Plans')
export class PublicPlanController {
  constructor(
    private readonly planService: PlanService,
    private readonly planUpgradeService: PlanUpgradeService,
  ) {}

  @Get()
  listPlans() {
    return this.planService.listPublicPlans();
  }

  @Get('upgrade/preview')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  previewUpgrade(@Query('planId') planId: string, @Req() req: Request) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.planUpgradeService.getUpgradePreview(auth.userId, planId);
  }

  @Post('upgrade/initiate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @UsePipes(bodyPipe)
  initiateUpgrade(@Body() body: InitiatePlanUpgradeDto, @Req() req: Request) {
    const auth = tenancyFromLocalUser(req.auth!.localUser as User);
    return this.planUpgradeService.initiateUpgrade(auth.userId, body.planId);
  }
}
