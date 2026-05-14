import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { Content, ContentSchema } from '../content/schemas/content.schema';
import { CostEntry, CostEntrySchema } from '../cost/schemas/cost-entry.schema';
import { Pipeline, PipelineSchema } from '../pipeline/schemas/pipeline.schema';
import { Rule, RuleSchema } from '../rule/schemas/rule.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Workflow, WorkflowSchema } from '../workflow/schemas/workflow.schema';
import { AdminContentController } from './controllers/admin-content.controller';
import { AdminCostController } from './controllers/admin-cost.controller';
import { AdminDashboardController } from './controllers/admin-dashboard.controller';
import { AdminUsersController } from './controllers/admin-users.controller';
import { AdminContentService } from './services/admin-content.service';
import { AdminCostService } from './services/admin-cost.service';
import { AdminDashboardService } from './services/admin-dashboard.service';
import { AdminUserProvisioningService } from './services/admin-user-provisioning.service';
import { AdminUsersService } from './services/admin-users.service';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Pipeline.name, schema: PipelineSchema },
      { name: Content.name, schema: ContentSchema },
      { name: Rule.name, schema: RuleSchema },
      { name: Workflow.name, schema: WorkflowSchema },
      { name: CostEntry.name, schema: CostEntrySchema },
    ]),
  ],
  controllers: [
    AdminDashboardController,
    AdminUsersController,
    AdminCostController,
    AdminContentController,
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
