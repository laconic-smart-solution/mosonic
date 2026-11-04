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
export type PipelineEventListener = (
  pipelineId: string,
  event: string,
  payload: unknown,
) => void;

@Injectable()
export class EventsService {
  private server: Server | null = null;
  private readonly pipelineListeners = new Set<PipelineEventListener>();

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
    if (this.realtimeBridgeEnabled() && !this.server) {
      void publishPipelineEventToRedis(
        this.realtimeRedisUrl(),
        pipelineId,
        event,
        payload,
      );
      return;
    }
    this.dispatchPipelineEvent(pipelineId, event, payload);
  }

  /**
   * Subscribe to pipeline events that reach this API process, whether emitted
   * here or bridged from a worker over Redis. Returns an unsubscribe function.
   */
  onPipelineEvent(listener: PipelineEventListener): () => void {
    this.pipelineListeners.add(listener);
    return () => this.pipelineListeners.delete(listener);
  }

  /** Room emit + in-process listeners. Used by emitToPipeline and the Redis bridge. */
  dispatchPipelineEvent(pipelineId: string, event: string, payload: unknown): void {
    if (this.server) {
      this.emitToRoom(`pipeline:${pipelineId}`, event, payload);
    }
    for (const listener of this.pipelineListeners) {
      try {
        listener(pipelineId, event, payload);
      } catch {
        // a listener must never break socket delivery
      }
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

  /** Chat step-trace live feed (client joins `chat_${sessionId}`). */
  emitToChatSession(sessionId: string, event: string, payload: unknown): void {
    this.emitToRoom(`chat_${sessionId}`, event, payload);
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
