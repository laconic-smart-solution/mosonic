import { BullModule } from '@nestjs/bullmq';
import {
  forwardRef,
  Injectable,
  Logger,
  Module,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ContentModule } from '../content/content.module';
import { PostModule } from '../post/post.module';
import { CampaignModule } from '../campaign/campaign.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { CostModule } from '../cost/cost.module';
import { CreditModule } from '../credit/credit.module';
import { EventsModule } from '../events/events.module';
import { LineModule } from '../line/line.module';
import { TelegramModule } from '../telegram/telegram.module';
import { ViberModule } from '../viber/viber.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { LoggingModule } from '../logging/logging.module';
import { LlmModule } from '../llm/llm.module';
import { NodesModule } from '../nodes/nodes.module';
import { PreprocessingModule } from '../preprocessing/preprocessing.module';
import { RepositoriesModule } from '../repositories/repositories.module';
import { UploadModule } from '../upload/upload.module';
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
import { PipelineNodeCompletionService } from './pipeline-node-completion.service';
import { PipelineNodeReviewService } from './pipeline-node-review.service';
import { PipelineNodeRunnerService } from './pipeline-node-runner.service';
import { TenantQueueService } from './tenant-queue.service';
import { ImageAssetRoleClassifierService } from './image-asset-role-classifier.service';
import { SourcePackBuilderService } from './source-pack-builder.service';
import { allQueueNamesForBase } from './queue-tenant.util';
import { QUEUES } from './types/queue.constants';
import {
  PIPELINE_NODES_DLQ,
  PIPELINE_NODES_QUEUE,
  PIPELINE_NODES_VIDEO_QUEUE,
} from './types/node-job.payload';

const runWorkersInApi = process.env.RUN_WORKERS_IN_API !== 'false';

function isLocalDatabaseUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  return (
    u.includes('127.0.0.1') ||
    u.includes('localhost') ||
    u.includes('@postgres:') ||
    u.includes('@db:')
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
    const databaseUrl = this.config.get<string>('DATABASE_URL') ?? '';
    const redisHost = (
      this.config.get<string>('REDIS_HOST') ?? '127.0.0.1'
    ).trim();
    const redisUrl = this.config.get<string>('REDIS_URL')?.trim();
    const queueMode =
      this.config
        .get<string>('ORCHESTRATION_USE_QUEUE', 'false')
        .toLowerCase() === 'true';
    const tenantIsolation =
      this.config
        .get<string>('QUEUE_TENANT_ISOLATION', 'false')
        .toLowerCase() === 'true';

    this.logger.log(
      `pipeline queue="${PIPELINE_NODES_QUEUE}" workersInApi=${runWorkersInApi} ` +
        `queueMode=${queueMode} tenantIsolation=${tenantIsolation} ` +
        `redis=${redisUrl ? 'REDIS_URL' : redisHost} postgres=${databaseUrl ? 'set' : 'unset'}`,
    );

    if (!runWorkersInApi) {
      this.logger.warn(
        'RUN_WORKERS_IN_API=false — start server/src/worker/main.ts or jobs will never run',
      );
    }

    const dbLocal = databaseUrl ? isLocalDatabaseUrl(databaseUrl) : false;
    const redisLocal = redisUrl
      ? /localhost|127\.0\.0\.1/i.test(redisUrl)
      : isLocalRedisHost(redisHost);
    if (dbLocal && !redisLocal) {
      this.logger.warn(
        'DATABASE_URL is local but Redis is remote — a shared Redis worker can mark BullMQ jobs ' +
          'completed without updating your local database. Use REDIS_HOST=127.0.0.1 for local dev, ' +
          'or point DATABASE_URL at the same database as the worker.',
      );
    }

    if (tenantIsolation) {
      const buckets = Number(this.config.get('QUEUE_TENANT_BUCKETS', 32));
      this.logger.log(
        `QUEUE_TENANT_ISOLATION=true — pipeline_nodes/video_generate/video_check ` +
          `sharded across ${buckets} bucket queues each`,
      );
    }
  }
}

@Module({
  imports: [
    ConfigModule,
    forwardRef(() => PostModule),
    forwardRef(() => CampaignModule),
    forwardRef(() => IntegrationsModule),
    CostModule,
    CreditModule,
    forwardRef(() => LineModule),
    forwardRef(() => TelegramModule),
    forwardRef(() => ViberModule),
    forwardRef(() => WhatsAppModule),
    NodesModule,
    LlmModule,
    PreprocessingModule,
    LoggingModule,
    EventsModule,
    forwardRef(() => UploadModule),
    forwardRef(() => ContentModule),
    RepositoriesModule,
    // Sharded when QUEUE_TENANT_ISOLATION=true: one BullMQ queue per tenant
    // bucket instead of one global queue, so a noisy user's backlog only
    // contends with the ~1/QUEUE_TENANT_BUCKETS of users hashed into the
    // same bucket. Queues are bound at Nest bootstrap (not per-request), so
    // every bucket is registered up front — see TenantQueueService for how a
    // userId is resolved to the right one at runtime.
    ...allQueueNamesForBase(PIPELINE_NODES_QUEUE).map((name) =>
      BullModule.registerQueueAsync({
        name,
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
    ),
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
    ...allQueueNamesForBase(QUEUES.VIDEO_GENERATE).map((name) =>
      BullModule.registerQueueAsync({
        name,
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
    ),
    ...allQueueNamesForBase(QUEUES.VIDEO_CHECK).map((name) =>
      BullModule.registerQueueAsync({
        name,
        imports: [ConfigModule],
        useFactory: () => ({
          defaultJobOptions: {
            attempts: 2,
            removeOnComplete: true,
          },
        }),
      }),
    ),
  ],
  providers: [
    OrchestrationModuleBootstrap,
    GraphMaterializationService,
    GraphReplanService,
    RuleOverlayBuilderService,
    NodeExecutor,
    PipelineNodeCompletionService,
    PipelineNodeReviewService,
    PipelineNodeRunnerService,
    MediaNodeCompletionService,
    HeygenWebhookService,
    OrchestrationService,
    TenantQueueService,
    DependencyResolverService,
    ImageAssetRoleClassifierService,
    SourcePackBuilderService,
    ...(process.env.RUN_WORKERS_IN_API !== 'false'
      ? [PipelineNodeProcessor, VideoGenerateProcessor, VideoCheckProcessor]
      : []),
  ],
  exports: [
    NodeExecutor,
    OrchestrationService,
    MediaNodeCompletionService,
    HeygenWebhookService,
    TenantQueueService,
    SourcePackBuilderService,
    BullModule,
  ],
})
export class OrchestrationModule {}
