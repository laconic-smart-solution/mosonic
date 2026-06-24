import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CreditModule } from '../credit/credit.module';
import { RepositoriesModule } from '../repositories/repositories.module';
import { PlanController } from './plan.controller';
import { PublicPlanController } from './public-plan.controller';
import { PlanService } from './plan.service';

@Module({
  imports: [AuthModule, CreditModule, RepositoriesModule],
  controllers: [PlanController, PublicPlanController],
  providers: [PlanService],
  exports: [PlanService],
})
export class PlanModule {}
