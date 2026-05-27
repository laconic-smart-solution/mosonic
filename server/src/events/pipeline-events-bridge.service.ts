import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { EventsService } from './events.service';
import {
  redisEnvFromConfig,
  resolveRedisUrl,
} from '../config/redis-connection.util';
import { PIPELINE_EVENTS_CHANNEL } from './pipeline-events-redis.util';
import {
  REALTIME_EVENTS_CHANNEL,
  type RealtimeRedisEnvelope,
} from './realtime-events-redis.util';
import { userRoom } from './notification.util';

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
    const url = resolveRedisUrl(redisEnvFromConfig(this.config));
    this.subscriber = new Redis(url, { maxRetriesPerRequest: null });
    void this.subscriber.subscribe(
      PIPELINE_EVENTS_CHANNEL,
      REALTIME_EVENTS_CHANNEL,
      (err) => {
        if (err) {
          this.logger.error(`Redis subscribe failed: ${err.message}`);
        }
      },
    );
    this.subscriber.on('message', (_channel, message) => {
      this.handleRedisMessage(message);
    });
    this.logger.log(
      'Realtime events Redis bridge listening (pipeline + rule + user)',
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (this.subscriber) {
      await this.subscriber.quit();
      this.subscriber = null;
    }
  }

  private handleRedisMessage(message: string): void {
    try {
      const parsed: unknown = JSON.parse(message);

      if (this.isRealtimeEnvelope(parsed)) {
        this.dispatchRealtimeEnvelope(parsed);
        return;
      }

      if (this.isLegacyPipelineMessage(parsed)) {
        this.events.emitToRoom(
          `pipeline:${parsed.pipelineId}`,
          parsed.event,
          parsed.payload,
        );
      }
    } catch (error) {
      this.logger.warn(
        `Ignored invalid realtime event message: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private isRealtimeEnvelope(value: unknown): value is RealtimeRedisEnvelope {
    if (!value || typeof value !== 'object') return false;
    const v = value as Record<string, unknown>;
    return (
      (v.scope === 'pipeline' ||
        v.scope === 'rule' ||
        v.scope === 'user') &&
      typeof v.id === 'string' &&
      typeof v.event === 'string'
    );
  }

  private isLegacyPipelineMessage(
    value: unknown,
  ): value is { pipelineId: string; event: string; payload?: unknown } {
    if (!value || typeof value !== 'object') return false;
    const v = value as Record<string, unknown>;
    return typeof v.pipelineId === 'string' && typeof v.event === 'string';
  }

  private dispatchRealtimeEnvelope(envelope: RealtimeRedisEnvelope): void {
    switch (envelope.scope) {
      case 'pipeline':
        this.events.emitToRoom(
          `pipeline:${envelope.id}`,
          envelope.event,
          envelope.payload,
        );
        break;
      case 'rule':
        this.events.emitToRoom(
          `rule_${envelope.id}`,
          envelope.event,
          envelope.payload,
        );
        break;
      case 'user':
        this.events.emitToRoom(
          userRoom(envelope.id),
          envelope.event,
          envelope.payload,
        );
        break;
      default:
        break;
    }
  }
}
