import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { CreditModule } from '../credit/credit.module';
import {
  CreditLedger,
  CreditLedgerSchema,
} from '../credit/schemas/credit-ledger.schema';
import { PlanModule } from '../plan/plan.module';
import { Plan, PlanSchema } from '../plan/schemas/plan.schema';
import { UserPlan, UserPlanSchema } from '../plan/schemas/user-plan.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { AdminUsageController } from './admin-usage.controller';
import { UsageController } from './usage.controller';
import { UsageService } from './usage.service';

@Module({
  imports: [
    AuthModule,
    CreditModule,
    PlanModule,
    MongooseModule.forFeature([
      { name: CreditLedger.name, schema: CreditLedgerSchema },
      { name: UserPlan.name, schema: UserPlanSchema },
      { name: Plan.name, schema: PlanSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [UsageController, AdminUsageController],
  providers: [UsageService],
  exports: [UsageService],
})
export class UsageModule {}
