import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PlanService } from './plan.service';

@Controller('plans')
@ApiTags('Plans')
export class PublicPlanController {
  constructor(private readonly planService: PlanService) {}

  @Get()
  listPlans() {
    return this.planService.listPublicPlans();
  }
}
