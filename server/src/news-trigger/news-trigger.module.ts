import { BullModule } from '@nestjs/bullmq';
import { Injectable, Logger, Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { EventsModule } from '../events/events.module';
import { LlmModule } from '../llm/llm.module';
import { OrchestrationModule } from '../orchestration/orchestration.module';
import { Pipeline, PipelineSchema } from '../pipeline/schemas/pipeline.schema';
import { Rule, RuleSchema } from '../rule/schemas/rule.schema';
import { WorkflowModule } from '../workflow/workflow.module';
import { NEWS_TRIGGER_QUEUE } from './news-trigger.constants';
import { NewsTriggerController } from './news-trigger.controller';
import { NewsTriggerCron } from './news-trigger.cron';
import { NewsTriggerManualService } from './news-trigger-manual.service';
import { NewsTriggerRunService } from './news-trigger-run.service';
import { NewsTriggerProcessor } from './news-trigger.processor';
import {
  NewsTriggerLog,
  NewsTriggerLogSchema,
} from './schemas/news-trigger-log.schema';
import { NewsFetchService } from './services/news-fetch.service';
import { NewsPickerService } from './services/news-picker.service';
import { NewsPromptBuilderService } from './services/news-prompt-builder.service';
import { NewsRelevanceService } from './services/news-relevance.service';
import { NewsTriggerLockService } from './services/news-trigger-lock.service';

const runWorkersInApi = process.env.RUN_WORKERS_IN_API !== 'false';

@Injectable()
class NewsTriggerModuleBootstrap implements OnModuleInit {
  private readonly logger = new Logger('NewsTriggerModule');

  onModuleInit(): void {
    this.logger.log(
      `queue="${NEWS_TRIGGER_QUEUE}" processorRegisteredInApi=${runWorkersInApi} ` +
        `RUN_WORKERS_IN_API=${process.env.RUN_WORKERS_IN_API ?? '(unset, default true)'}`,
    );
    if (!runWorkersInApi) {
      this.logger.warn(
        'News jobs require a separate worker process (see server/src/worker/main.ts)',
      );
    }
  }
}

@Module({
  imports: [
    AuthModule,
    ConfigModule,
    LlmModule,
    EventsModule,
    OrchestrationModule,
    WorkflowModule,
    MongooseModule.forFeature([
      { name: Rule.name, schema: RuleSchema },
      { name: NewsTriggerLog.name, schema: NewsTriggerLogSchema },
      { name: Pipeline.name, schema: PipelineSchema },
    ]),
    BullModule.registerQueue({
      name: NEWS_TRIGGER_QUEUE,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'fixed', delay: 5000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      },
    }),
  ],
  controllers: [NewsTriggerController],
  providers: [
    NewsTriggerModuleBootstrap,
    NewsTriggerCron,
    NewsTriggerManualService,
    NewsTriggerRunService,
    NewsFetchService,
    NewsPickerService,
    NewsRelevanceService,
    NewsPromptBuilderService,
    NewsTriggerLockService,
    ...(runWorkersInApi ? [NewsTriggerProcessor] : []),
  ],
  exports: [NewsTriggerManualService, NewsTriggerRunService],
})
export class NewsTriggerModule {}
