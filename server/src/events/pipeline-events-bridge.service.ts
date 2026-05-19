import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { EventsService } from './events.service';
import { PIPELINE_EVENTS_CHANNEL } from './pipeline-events-redis.util';

export { PIPELINE_EVENTS_CHANNEL } from './pipeline-events-redis.util';

@Injectable()
export class PipelineEventsBridgeService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PipelineEventsBridgeService.name);
  private subscriber: Redis | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly events: EventsService,
  ) {}

  onModuleInit(): void {
    if (this.config.get<string>('PIPELINE_EVENTS_BRIDGE', 'true') === 'false') {
      return;
    }
    const url = this.config.get<string>('REDIS_URL')?.trim();
    if (!url) {
      return;
    }
    this.subscriber = new Redis(url, { maxRetriesPerRequest: null });
    void this.subscriber.subscribe(PIPELINE_EVENTS_CHANNEL, (err) => {
      if (err) {
        this.logger.error(`Redis subscribe failed: ${err.message}`);
      }
    });
    this.subscriber.on('message', (_channel, message) => {
      try {
        const parsed = JSON.parse(message) as {
          pipelineId?: string;
          event?: string;
          payload?: unknown;
        };
        if (parsed.pipelineId && parsed.event) {
          this.events.emitToPipeline(
            parsed.pipelineId,
            parsed.event,
            parsed.payload,
          );
        }
      } catch (error) {
        this.logger.warn(
          `Ignored invalid pipeline event message: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
    this.logger.log('Pipeline events Redis bridge listening');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.subscriber) {
      await this.subscriber.quit();
      this.subscriber = null;
    }
  }

}
