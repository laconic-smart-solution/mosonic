import { BullModule } from '@nestjs/bullmq';
import { forwardRef, Injectable, Logger, Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ContentModule } from '../content/content.module';
import { Content, ContentSchema } from '../content/schemas/content.schema';
import { AnalyticsModule } from '../analytics/analytics.module';
import { CampaignModule } from '../campaign/campaign.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { CostModule } from '../cost/cost.module';
import { CreditModule } from '../credit/credit.module';
import { EventsModule } from '../events/events.module';
import { LoggingModule } from '../logging/logging.module';
import { NodesModule } from '../nodes/nodes.module';
import { PipelineRepository } from '../pipeline/pipeline.repository';
import { Pipeline, PipelineSchema } from '../pipeline/schemas/pipeline.schema';
import { UploadModule } from '../upload/upload.module';
import {
  WorkflowNode,
  WorkflowNodeSchema,
} from '../nodes/schemas/workflow-node.schema';
import { Rule, RuleSchema } from '../rule/schemas/rule.schema';
import { Workflow, WorkflowSchema } from '../workflow/schemas/workflow.schema';
import { DependencyResolverService } from './dependency-resolver.service';
import { GraphMaterializationService } from './graph-materialization.service';
import { GraphReplanService } from './graph-replan.service';
import { RuleOverlayBuilderService } from './rule-overlay-builder.service';
import { NodeExecutor } from './node-executor.service';
import { OrchestrationService } from './orchestration.service';
import { HeygenWebhookService } from './heygen-webhook.service';
import { MediaNodeCompletionService } from './media-node-completion.service';
import { PipelineNodeProcessor } from './processors/pipeline-node.processor';
import { VideoCheckProcessor } from './processors/video-check.processor';
import { VideoGenerateProcessor } from './processors/video-generate.processor';
import { PipelineNodeRunnerService } from './pipeline-node-runner.service';
import { QUEUES } from './types/queue.constants';
import {
  PIPELINE_NODES_DLQ,
  PIPELINE_NODES_QUEUE,
  PIPELINE_NODES_VIDEO_QUEUE,
} from './types/node-job.payload';

const runWorkersInApi = process.env.RUN_WORKERS_IN_API !== 'false';

function isLocalMongoUri(uri: string): boolean {
  const u = uri.trim().toLowerCase();
  return (
    u.includes('127.0.0.1') ||
    u.includes('localhost') ||
    u.startsWith('mongodb://mongo:')
  );
}

function isLocalRedisHost(host: string): boolean {
  const h = host.trim().toLowerCase();
  return h === '127.0.0.1' || h === 'localhost' || h === 'redis';
}

@Injectable()
class OrchestrationModuleBootstrap implements OnModuleInit {
  private readonly logger = new Logger('OrchestrationModule');

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const mongoUri = this.config.get<string>('MONGODB_URI') ?? '';
    const redisHost = (this.config.get<string>('REDIS_HOST') ?? '127.0.0.1').trim();
    const redisUrl = this.config.get<string>('REDIS_URL')?.trim();
    const queueMode =
      this.config.get<string>('ORCHESTRATION_USE_QUEUE', 'false').toLowerCase() ===
      'true';
    const tenantIsolation =
      this.config.get<string>('QUEUE_TENANT_ISOLATION', 'false').toLowerCase() ===
      'true';

    this.logger.log(
      `pipeline queue="${PIPELINE_NODES_QUEUE}" workersInApi=${runWorkersInApi} ` +
        `queueMode=${queueMode} tenantIsolation=${tenantIsolation} ` +
        `redis=${redisUrl ? 'REDIS_URL' : redisHost} mongo=${mongoUri ? 'set' : 'unset'}`,
    );

    if (!runWorkersInApi) {
      this.logger.warn(
        'RUN_WORKERS_IN_API=false — start server/src/worker/main.ts or jobs will never run',
      );
    }

    const mongoLocal = mongoUri ? isLocalMongoUri(mongoUri) : false;
    const redisLocal = redisUrl
      ? /localhost|127\.0\.0\.1/i.test(redisUrl)
      : isLocalRedisHost(redisHost);
    if (mongoLocal && !redisLocal) {
      this.logger.warn(
        'MONGODB_URI is local but Redis is remote — a shared Redis worker can mark BullMQ jobs ' +
          'completed without updating your local database. Use REDIS_HOST=127.0.0.1 for local dev, ' +
          'or point MONGODB_URI at the same database as the worker.',
      );
    }

    if (tenantIsolation) {
      this.logger.warn(
        'QUEUE_TENANT_ISOLATION=true is not wired to enqueue/workers yet; use false for local dev',
      );
    }
  }
}

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => AnalyticsModule),
    forwardRef(() => CampaignModule),
    forwardRef(() => IntegrationsModule),
    CostModule,
    CreditModule,
    NodesModule,
    LoggingModule,
    EventsModule,
    forwardRef(() => UploadModule),
    forwardRef(() => ContentModule),
    BullModule.registerQueueAsync({
      name: PIPELINE_NODES_QUEUE,
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        defaultJobOptions: {
          attempts: Number(config.get('QUEUE_MAX_ATTEMPTS', 2)),
          backoff: {
            type: 'fixed',
            delay: Number(config.get('QUEUE_RETRY_DELAY_MS', 3000)),
          },
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueueAsync({
      name: PIPELINE_NODES_DLQ,
      imports: [ConfigModule],
      useFactory: () => ({
        defaultJobOptions: {
          removeOnComplete: false,
          removeOnFail: false,
        },
      }),
    }),
    BullModule.registerQueueAsync({
      name: PIPELINE_NODES_VIDEO_QUEUE,
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        defaultJobOptions: {
          attempts: Number(config.get('QUEUE_MAX_ATTEMPTS', 2)),
          backoff: {
            type: 'fixed',
            delay: Number(config.get('QUEUE_RETRY_DELAY_MS', 3000)),
          },
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueueAsync({
      name: QUEUES.VIDEO_GENERATE,
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        defaultJobOptions: {
          attempts: Number(config.get('QUEUE_MAX_ATTEMPTS', 2)),
          backoff: {
            type: 'fixed',
            delay: Number(config.get('QUEUE_RETRY_DELAY_MS', 3000)),
          },
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueueAsync({
      name: QUEUES.VIDEO_CHECK,
      imports: [ConfigModule],
      useFactory: () => ({
        defaultJobOptions: {
          attempts: 1,
          removeOnComplete: true,
        },
      }),
    }),
    MongooseModule.forFeature([
      { name: Pipeline.name, schema: PipelineSchema },
      { name: Workflow.name, schema: WorkflowSchema },
      { name: WorkflowNode.name, schema: WorkflowNodeSchema },
      { name: Rule.name, schema: RuleSchema },
      { name: Content.name, schema: ContentSchema },
    ]),
  ],
  providers: [
    OrchestrationModuleBootstrap,
    PipelineRepository,
    GraphMaterializationService,
    GraphReplanService,
    RuleOverlayBuilderService,
    NodeExecutor,
    PipelineNodeRunnerService,
    MediaNodeCompletionService,
    HeygenWebhookService,
    OrchestrationService,
    DependencyResolverService,
    ...(process.env.RUN_WORKERS_IN_API !== 'false'
      ? [PipelineNodeProcessor, VideoGenerateProcessor, VideoCheckProcessor]
      : []),
  ],
  exports: [
    NodeExecutor,
    OrchestrationService,
    PipelineRepository,
    MediaNodeCompletionService,
    HeygenWebhookService,
    BullModule,
  ],
})
export class OrchestrationModule {}
