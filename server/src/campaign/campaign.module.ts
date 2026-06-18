import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { ContentModule } from '../content/content.module';
import { EventsModule } from '../events/events.module';
import { McpModule } from '../mcp/mcp.module';
import { OrchestrationModule } from '../orchestration/orchestration.module';
import { Pipeline, PipelineSchema } from '../pipeline/schemas/pipeline.schema';
import { Rule, RuleSchema } from '../rule/schemas/rule.schema';
import { UploadModule } from '../upload/upload.module';
import { Workflow, WorkflowSchema } from '../workflow/schemas/workflow.schema';
import { WorkflowModule } from '../workflow/workflow.module';
import { CampaignAutonomyService } from './campaign-autonomy.service';
import { CampaignAutonomyController } from './campaign-autonomy.controller';
import { CampaignController } from './campaign.controller';
import { CampaignScheduleService } from './campaign-schedule.service';
import { CampaignSchedulerService } from './campaign-scheduler.service';
import {
  CampaignAutonomyPolicy,
  CampaignAutonomyPolicySchema,
} from './schemas/campaign-autonomy-policy.schema';
import {
  CampaignSchedule,
  CampaignScheduleSchema,
} from './schemas/campaign-schedule.schema';

@Module({
  imports: [
    AuthModule,
    forwardRef(() => OrchestrationModule),
    forwardRef(() => WorkflowModule),
    EventsModule,
    McpModule,
    forwardRef(() => ContentModule),
    forwardRef(() => UploadModule),
    MongooseModule.forFeature([
      { name: CampaignSchedule.name, schema: CampaignScheduleSchema },
      { name: CampaignAutonomyPolicy.name, schema: CampaignAutonomyPolicySchema },
      { name: Rule.name, schema: RuleSchema },
      { name: Workflow.name, schema: WorkflowSchema },
      { name: Pipeline.name, schema: PipelineSchema },
    ]),
  ],
  controllers: [CampaignController, CampaignAutonomyController],
  providers: [
    CampaignScheduleService,
    CampaignSchedulerService,
    CampaignAutonomyService,
  ],
  exports: [CampaignScheduleService, CampaignAutonomyService],
})
export class CampaignModule {}
