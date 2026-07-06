import { forwardRef, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RepositoriesModule } from '../repositories/repositories.module';
import { AdminApiUsageController } from './controllers/admin-api-usage.controller';
import { AdminOpenAiBillingController } from './controllers/admin-openai-billing.controller';
import { AdminContentController } from './controllers/admin-content.controller';
import { AdminFaqController } from './controllers/admin-faq.controller';
import { AdminTopupPlansController } from './controllers/admin-topup-plans.controller';
import { AdminCostController } from './controllers/admin-cost.controller';
import { AdminDashboardController } from './controllers/admin-dashboard.controller';
import { AdminPipelineJobsController } from './controllers/admin-pipeline-jobs.controller';
import { AdminUsersController } from './controllers/admin-users.controller';
import { PaymentModule } from '../payment/payment.module';
import { CreditModule } from '../credit/credit.module';
import { PlanModule } from '../plan/plan.module';
import { UsageModule } from '../usage/usage.module';
import { OrchestrationModule } from '../orchestration/orchestration.module';
import { OpenAiBillingModule } from '../openai-billing/openai-billing.module';
import { ApiUsageModule } from '../api-usage/api-usage.module';
import { ContentModule } from '../content/content.module';
import { AdminContentService } from './services/admin-content.service';
import { AdminCostService } from './services/admin-cost.service';
import { AdminDashboardService } from './services/admin-dashboard.service';
import { AdminUserProvisioningService } from './services/admin-user-provisioning.service';
import { AdminUsersService } from './services/admin-users.service';
import { AdminFaqClientService } from './services/admin-faq-client.service';
import { AdminFaqService } from './services/admin-faq.service';

@Module({
  imports: [
    AuthModule,
    CreditModule,
    PaymentModule,
    PlanModule,
    RepositoriesModule,
    UsageModule,
    OpenAiBillingModule,
    ApiUsageModule,
    ContentModule,
    forwardRef(() => OrchestrationModule),
  ],
  controllers: [
    AdminDashboardController,
    AdminApiUsageController,
    AdminOpenAiBillingController,
    AdminUsersController,
    AdminCostController,
    AdminContentController,
    AdminFaqController,
    AdminTopupPlansController,
    AdminPipelineJobsController,
  ],
  providers: [
    AdminDashboardService,
    AdminUsersService,
    AdminCostService,
    AdminContentService,
    AdminFaqClientService,
    AdminFaqService,
    AdminUserProvisioningService,
  ],
})
export class AdminModule {}
