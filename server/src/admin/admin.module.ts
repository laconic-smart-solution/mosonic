import { forwardRef, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RepositoriesModule } from '../repositories/repositories.module';
import { AdminContentController } from './controllers/admin-content.controller';
import { AdminCostController } from './controllers/admin-cost.controller';
import { AdminDashboardController } from './controllers/admin-dashboard.controller';
import { AdminPipelineJobsController } from './controllers/admin-pipeline-jobs.controller';
import { AdminUsersController } from './controllers/admin-users.controller';
import { CreditModule } from '../credit/credit.module';
import { PlanModule } from '../plan/plan.module';
import { UsageModule } from '../usage/usage.module';
import { OrchestrationModule } from '../orchestration/orchestration.module';
import { AdminContentService } from './services/admin-content.service';
import { AdminCostService } from './services/admin-cost.service';
import { AdminDashboardService } from './services/admin-dashboard.service';
import { AdminUserProvisioningService } from './services/admin-user-provisioning.service';
import { AdminUsersService } from './services/admin-users.service';

@Module({
  imports: [
    AuthModule,
    CreditModule,
    PlanModule,
    RepositoriesModule,
    UsageModule,
    forwardRef(() => OrchestrationModule),
  ],
  controllers: [
    AdminDashboardController,
    AdminUsersController,
    AdminCostController,
    AdminContentController,
    AdminPipelineJobsController,
  ],
  providers: [
    AdminDashboardService,
    AdminUsersService,
    AdminCostService,
    AdminContentService,
    AdminUserProvisioningService,
  ],
})
export class AdminModule {}
