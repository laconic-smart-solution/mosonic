import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { Server } from 'socket.io';
import {
  redisEnvFromConfig,
  resolveRedisUrl,
} from '../config/redis-connection.util';
import type {
  AppNotificationPayload,
  EmitUserNotificationArgs,
} from './notification.types';
import { userRoom } from './notification.util';
import { publishPipelineEventToRedis } from './pipeline-events-redis.util';
import { publishRealtimeEventToRedis } from './realtime-events-redis.util';

/**
 * Server-side emit API for orchestration, logging streams, etc.
 * The gateway calls {@link EventsService.setServer} once Socket.IO is ready.
 */
@Injectable()
export class EventsService {
  private server: Server | null = null;

  constructor(private readonly config: ConfigService) {}

  setServer(server: Server): void {
    this.server = server;
  }

  private get io(): Server {
    if (!this.server) {
      throw new Error('Socket.IO server is not initialized yet');
    }
    return this.server;
  }

  private realtimeBridgeEnabled(): boolean {
    return (
      this.config.get<string>('PIPELINE_EVENTS_BRIDGE', 'true') !== 'false'
    );
  }

  private realtimeRedisUrl(): string {
    return resolveRedisUrl(redisEnvFromConfig(this.config));
  }

  /** Emit an event to everyone in a room (API process only). */
  emitToRoom(room: string, event: string, payload: unknown): void {
    this.io.to(room).emit(event, payload);
  }

  /** Convenience for pipeline-scoped channels (orchestration logs, node updates). */
  emitToPipeline(pipelineId: string, event: string, payload: unknown): void {
    if (this.realtimeBridgeEnabled()) {
      void publishPipelineEventToRedis(
        this.realtimeRedisUrl(),
        pipelineId,
        event,
        payload,
      );
      return;
    }
    if (this.server) {
      this.emitToRoom(`pipeline:${pipelineId}`, event, payload);
    }
  }

  /** Convenience for async rule-extraction and news-trigger progress channels. */
  emitToRule(ruleId: string, event: string, payload: unknown): void {
    if (this.realtimeBridgeEnabled() && !this.server) {
      void publishRealtimeEventToRedis(this.realtimeRedisUrl(), {
        scope: 'rule',
        id: ruleId,
        event,
        payload,
      });
      return;
    }
    if (this.server) {
      this.emitToRoom(`rule_${ruleId}`, event, payload);
    }
  }

  /** Convenience for async workflow-generation progress channels. */
  emitToWorkflow(workflowId: string, event: string, payload: unknown): void {
    this.emitToRoom(`workflow_${workflowId}`, event, payload);
  }

  /** Content detail / node re-run channel (client joins `content_${contentId}`). */
  emitToContent(contentId: string, event: string, payload: unknown): void {
    this.emitToRoom(`content_${contentId}`, event, payload);
  }

  /** Analytics dashboard / manual pull (client joins `analytics_${ruleId}`). */
  emitToAnalyticsRule(ruleId: string, event: string, payload: unknown): void {
    this.emitToRoom(`analytics_${ruleId}`, event, payload);
  }

  /** Broadcast to all connected clients (use sparingly). */
  emitBroadcast(event: string, payload: unknown): void {
    this.io.emit(event, payload);
  }

  /** Per-user notification channel (client auto-joins `user:{userId}` when authenticated). */
  emitToUser(userId: string, payload: AppNotificationPayload): void {
    const id = userId?.trim();
    if (!id) return;
    if (this.realtimeBridgeEnabled() && !this.server) {
      void publishRealtimeEventToRedis(this.realtimeRedisUrl(), {
        scope: 'user',
        id,
        event: 'notification',
        payload,
      });
      return;
    }
    if (this.server) {
      this.emitToRoom(userRoom(id), 'notification', payload);
    }
  }

  emitUserNotification(args: EmitUserNotificationArgs): void {
    const payload: AppNotificationPayload = {
      id: randomUUID(),
      sector: args.sector,
      type: args.type,
      title: args.title,
      message: args.message,
      createdAt: new Date().toISOString(),
      ...(args.data ? { data: args.data } : {}),
      ...(args.action ? { action: args.action } : {}),
    };
    this.emitToUser(args.userId, payload);
  }
}
