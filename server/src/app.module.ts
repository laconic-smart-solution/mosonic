import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { GlobalHttpExceptionFilter } from './common/filters/http-exception.filter';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PreprocessingModule } from './preprocessing/preprocessing.module';
import { ContentModule } from './content/content.module';
import { EventsModule } from './events/events.module';
import { LlmModule } from './llm/llm.module';
import { LoggingModule } from './logging/logging.module';
import { McpModule } from './mcp/mcp.module';
import { NodesModule } from './nodes/nodes.module';
import { OrchestrationModule } from './orchestration/orchestration.module';
import { PipelineModule } from './pipeline/pipeline.module';
import { RuleModule } from './rule/rule.module';
import { PostModule } from './post/post.module';
import { UploadModule } from './upload/upload.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { LineModule } from './line/line.module';
import { WebhookModule } from './webhook/webhook.module';
import { WorkflowModule } from './workflow/workflow.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AdminModule } from './admin/admin.module';
import { FaqModule } from './faq/faq.module';
import { CostModule } from './cost/cost.module';
import { CreditModule } from './credit/credit.module';
import { PlanModule } from './plan/plan.module';
import { UsageModule } from './usage/usage.module';
import { CampaignModule } from './campaign/campaign.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { NewsTriggerModule } from './news-trigger/news-trigger.module';
import { RedNoteModule } from './rednote/rednote.module';
import {
  buildRedisConnectionOptions,
  redisEnvFromConfig,
} from './config/redis-connection.util';

@Module({
  imports: [
    DatabaseModule,
    ScheduleModule.forRoot(),
    AuthModule,
    UsersModule,
    AdminModule,
    FaqModule,
    LlmModule,
    PreprocessingModule,
    CostModule,
    CreditModule,
    PlanModule,
    UsageModule,
    EventsModule,
    NodesModule,
    LoggingModule,
    OrchestrationModule,
    RuleModule,
    WorkflowModule,
    PipelineModule,
    ContentModule,
    UploadModule,
    PostModule,
    SchedulerModule,
    WebhookModule,
    LineModule,
    CampaignModule,
    NewsTriggerModule,
    IntegrationsModule,
    DashboardModule,
    McpModule,
    RedNoteModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        connection: buildRedisConnectionOptions(
          redisEnvFromConfig(configService),
        ),
        defaultJobOptions: {
          attempts: Number(configService.get('QUEUE_MAX_ATTEMPTS', 2)),
          backoff: {
            type: 'fixed',
            delay: Number(configService.get('QUEUE_RETRY_DELAY_MS', 3000)),
          },
          removeOnComplete: 100,
          removeOnFail: 200,
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: GlobalHttpExceptionFilter,
    },
  ],
})
export class AppModule {}
