import { forwardRef, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ContentModule } from '../content/content.module';
import { EventsModule } from '../events/events.module';
import { McpModule } from '../mcp/mcp.module';
import { OrchestrationModule } from '../orchestration/orchestration.module';
import { RepositoriesModule } from '../repositories/repositories.module';
import { UploadModule } from '../upload/upload.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { CampaignAutonomyService } from './campaign-autonomy.service';
import { CampaignAutonomyController } from './campaign-autonomy.controller';
import { CampaignController } from './campaign.controller';
import { CampaignScheduleService } from './campaign-schedule.service';
import { CampaignSchedulerService } from './campaign-scheduler.service';

@Module({
  imports: [
    AuthModule,
    RepositoriesModule,
    forwardRef(() => OrchestrationModule),
    forwardRef(() => WorkflowModule),
    EventsModule,
    McpModule,
    forwardRef(() => ContentModule),
    forwardRef(() => UploadModule),
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
