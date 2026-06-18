import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { Content, ContentSchema } from '../content/schemas/content.schema';
import { CostEntry, CostEntrySchema } from '../cost/schemas/cost-entry.schema';
import { Pipeline, PipelineSchema } from '../pipeline/schemas/pipeline.schema';
import { Rule, RuleSchema } from '../rule/schemas/rule.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { UserPlan, UserPlanSchema } from '../plan/schemas/user-plan.schema';
import { Plan, PlanSchema } from '../plan/schemas/plan.schema';
import { Workflow, WorkflowSchema } from '../workflow/schemas/workflow.schema';
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
    UsageModule,
    forwardRef(() => OrchestrationModule),
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Pipeline.name, schema: PipelineSchema },
      { name: Content.name, schema: ContentSchema },
      { name: Rule.name, schema: RuleSchema },
      { name: Workflow.name, schema: WorkflowSchema },
      { name: CostEntry.name, schema: CostEntrySchema },
      { name: UserPlan.name, schema: UserPlanSchema },
      { name: Plan.name, schema: PlanSchema },
    ]),
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
