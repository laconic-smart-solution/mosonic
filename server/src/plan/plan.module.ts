import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { CreditModule } from '../credit/credit.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { PlanController } from './plan.controller';
import { PlanService } from './plan.service';
import { Plan, PlanSchema } from './schemas/plan.schema';
import { UserPlan, UserPlanSchema } from './schemas/user-plan.schema';

@Module({
  imports: [
    AuthModule,
    CreditModule,
    MongooseModule.forFeature([
      { name: Plan.name, schema: PlanSchema },
      { name: UserPlan.name, schema: UserPlanSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [PlanController],
  providers: [PlanService],
  exports: [PlanService, MongooseModule],
})
export class PlanModule {}
