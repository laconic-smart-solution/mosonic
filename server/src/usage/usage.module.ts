import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CreditModule } from '../credit/credit.module';
import { PlanModule } from '../plan/plan.module';
import { RepositoriesModule } from '../repositories/repositories.module';
import { AdminUsageController } from './admin-usage.controller';
import { UsageController } from './usage.controller';
import { UsageService } from './usage.service';

@Module({
  imports: [AuthModule, CreditModule, PlanModule, RepositoriesModule],
  controllers: [UsageController, AdminUsageController],
  providers: [UsageService],
  exports: [UsageService],
})
export class UsageModule {}
