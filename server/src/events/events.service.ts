import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';

/**
 * Server-side emit API for orchestration, logging streams, etc.
 * The gateway calls {@link EventsService.setServer} once Socket.IO is ready.
 */
@Injectable()
export class EventsService {
  private server: Server | null = null;

  setServer(server: Server): void {
    this.server = server;
  }

  private get io(): Server {
    if (!this.server) {
      throw new Error('Socket.IO server is not initialized yet');
    }
    return this.server;
  }

  /** Emit an event to everyone in a room. */
  emitToRoom(room: string, event: string, payload: unknown): void {
    this.io.to(room).emit(event, payload);
  }

  /** Convenience for pipeline-scoped channels (orchestration logs, node updates). */
  emitToPipeline(pipelineId: string, event: string, payload: unknown): void {
    this.emitToRoom(`pipeline:${pipelineId}`, event, payload);
  }

  /** Convenience for async rule-extraction progress channels. */
  emitToRule(ruleId: string, event: string, payload: unknown): void {
    this.emitToRoom(`rule_${ruleId}`, event, payload);
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
}
