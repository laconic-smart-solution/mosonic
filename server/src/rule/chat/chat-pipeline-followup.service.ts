import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { TenancyAuth } from '../../auth/tenancy.types';
import {
  buildRedisConnectionOptions,
  redisEnvFromConfig,
} from '../../config/redis-connection.util';
import { EventsService } from '../../events/events.service';
import { OrchestrationService } from '../../orchestration/orchestration.service';
import type { AgentStep } from '../tools/tool-calling-loop';
import { ChatTurnLockService } from './chat-turn-lock.service';
import { ChatSessionService } from './chat-session.service';
import {
  buildPipelineResultObservation,
  buildRunProgress,
  type ChatRunProgress,
} from './chat-run-progress.util';

/** How long a chat-started run stays linked to its chat (covers slow image runs). */
export const RUN_WATCH_TTL_SEC = 6 * 60 * 60;
/** Backoff while a user turn holds the chat lock; total ~3.5 min before giving up. */
export const FOLLOWUP_LOCK_BACKOFF_MS = [500, 1000, 2000, 4000, 8000, 15000, 30000, 60000, 90000];

export type RunWatch = {
  sessionId: string;
  pipelineId: string;
  auth: TenancyAuth;
  startedAt: string;
};

const TERMINAL_EVENTS = new Set(['pipeline:completed', 'pipeline:failed']);
const PROGRESS_EVENTS = new Set([
  'pipeline:started',
  'pipeline:completed',
  'pipeline:failed',
  'pipeline:paused',
  'pipeline:lane_paused',
  'node:completed',
  'node:failed_final',
  'node:waiting_review',
]);

/** Pulls `pipelineId` out of a successful start_generation observation. */
export function startedPipelineIdsFromSteps(steps: AgentStep[]): string[] {
  const ids: string[] = [];
  for (const step of steps) {
    if (step.type !== 'observation') continue;
    try {
      const parsed = JSON.parse(step.result) as {
        ok?: unknown;
        action?: unknown;
        pipelineId?: unknown;
      };
      if (
        parsed.ok === true &&
        parsed.action === 'pipeline_started' &&
        typeof parsed.pipelineId === 'string'
      ) {
        ids.push(parsed.pipelineId);
      }
    } catch {
      // not JSON
    }
  }
  return ids;
}

/**
 * Links chat-started pipeline runs to their chat, forwards node progress to
 * the chat room (`chat:run-progress`), and when the run ends runs one short
 * follow-up AI turn so the chat reports the result (once per pipeline).
 */
@Injectable()
export class ChatPipelineFollowupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChatPipelineFollowupService.name);
  private client: Redis | null = null;
  private unsubscribe: (() => void) | null = null;
  /** Test seam. */
  sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  constructor(
    private readonly config: ConfigService,
    private readonly events: EventsService,
    private readonly turnLock: ChatTurnLockService,
    @Inject(forwardRef(() => ChatSessionService))
    private readonly chat: ChatSessionService,
    @Inject(forwardRef(() => OrchestrationService))
    private readonly orchestration: OrchestrationService,
  ) {}

  onModuleInit(): void {
    this.unsubscribe = this.events.onPipelineEvent((pipelineId, event, payload) => {
      void this.handlePipelineEvent(pipelineId, event, payload).catch((err) =>
        this.logger.warn(
          `Run follow-up for ${pipelineId} (${event}) failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.unsubscribe?.();
    if (this.client) {
      await this.client.quit();
      this.client = null;
    }
  }

  protected redis(): Redis {
    if (!this.client) {
      this.client = new Redis(buildRedisConnectionOptions(redisEnvFromConfig(this.config)));
    }
    return this.client;
  }

  private watchKey(pipelineId: string) {
    return `chat:run-watch:${pipelineId}`;
  }

  private doneKey(pipelineId: string) {
    return `chat:run-followup:${pipelineId}`;
  }

  async watch(sessionId: string, pipelineId: string, auth: TenancyAuth): Promise<void> {
    const value: RunWatch = {
      sessionId,
      pipelineId,
      auth: { userId: auth.userId, role: auth.role },
      startedAt: new Date().toISOString(),
    };
    await this.redis().set(this.watchKey(pipelineId), JSON.stringify(value), 'EX', RUN_WATCH_TTL_SEC);
    // First card render without waiting for the first node event.
    await this.emitProgress(value).catch(() => undefined);
  }

  async getWatch(pipelineId: string): Promise<RunWatch | null> {
    const raw = await this.redis().get(this.watchKey(pipelineId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as RunWatch;
    } catch {
      return null;
    }
  }

  /** Active runs for a chat, so the client can restore the run card on reload. */
  async getProgress(pipelineId: string): Promise<ChatRunProgress | null> {
    const watch = await this.getWatch(pipelineId);
    if (!watch) return null;
    const snapshot = await this.orchestration.getPipeline(pipelineId, watch.auth);
    return buildRunProgress(watch.sessionId, snapshot);
  }

  async handlePipelineEvent(pipelineId: string, event: string, payload: unknown): Promise<void> {
    if (!PROGRESS_EVENTS.has(event)) return;
    const watch = await this.getWatch(pipelineId);
    if (!watch) return;

    const error =
      event === 'pipeline:failed' ? payloadMessage(payload) ?? 'The run failed.' : null;
    const progress = await this.emitProgress(watch, error, event);

    if (TERMINAL_EVENTS.has(event) && progress) {
      await this.runFollowUp(watch, progress, payload, error);
    }
  }

  private async emitProgress(
    watch: RunWatch,
    error: string | null = null,
    event?: string,
  ): Promise<ChatRunProgress | null> {
    let snapshot: Awaited<ReturnType<OrchestrationService['getPipeline']>>;
    try {
      snapshot = await this.orchestration.getPipeline(watch.pipelineId, watch.auth);
    } catch (err) {
      this.logger.warn(
        `Run progress: cannot load ${watch.pipelineId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
    // The terminal event can arrive a moment before the status row flips.
    if (event === 'pipeline:completed') snapshot.pipeline.status = 'completed';
    if (event === 'pipeline:failed') snapshot.pipeline.status = 'failed';
    const progress = buildRunProgress(watch.sessionId, snapshot, Date.now(), error);
    this.events.emitToChatSession(watch.sessionId, 'chat:run-progress', progress);
    return progress;
  }

  /** Idempotent per pipeline: the first caller claims it, later events are ignored. */
  async runFollowUp(
    watch: RunWatch,
    progress: ChatRunProgress,
    payload: unknown,
    error: string | null,
  ): Promise<boolean> {
    const claimed = await this.redis().set(this.doneKey(watch.pipelineId), '1', 'EX', RUN_WATCH_TTL_SEC, 'NX');
    if (claimed !== 'OK') return false;

    const token = await this.acquireWithBackoff(watch.sessionId);
    if (!token) {
      this.logger.warn(
        `Run follow-up for ${watch.pipelineId}: chat ${watch.sessionId} stayed busy, giving up.`,
      );
      return false;
    }
    try {
      const contentId =
        payloadString(payload, 'contentId') ??
        (await this.orchestration
          .getPipeline(watch.pipelineId, watch.auth)
          .then((s) => s.pipeline.contentId ?? null)
          .catch(() => null));
      const observation = buildPipelineResultObservation({
        progress,
        contentId,
        hasImage: await this.hasImage(watch),
        error,
      });
      await this.chat.runPipelineFollowUp(watch.sessionId, watch.auth, watch.pipelineId, observation);
      await this.redis().del(this.watchKey(watch.pipelineId));
      return true;
    } catch (err) {
      this.logger.warn(
        `Run follow-up turn for ${watch.pipelineId} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return false;
    } finally {
      await this.turnLock.release(watch.sessionId, token);
    }
  }

  private async hasImage(watch: RunWatch): Promise<boolean> {
    try {
      const snapshot = await this.orchestration.getPipeline(watch.pipelineId, watch.auth);
      return snapshot.nodes.some(
        (n) => String(n.type) === 'image_generation' && String(n.status) === 'completed',
      );
    } catch {
      return false;
    }
  }

  private async acquireWithBackoff(sessionId: string): Promise<string | null> {
    const first = await this.turnLock.tryAcquire(sessionId);
    if (first) return first;
    for (const delay of FOLLOWUP_LOCK_BACKOFF_MS) {
      await this.sleep(delay);
      const token = await this.turnLock.tryAcquire(sessionId);
      if (token) return token;
    }
    return null;
  }
}

function payloadString(payload: unknown, key: string): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function payloadMessage(payload: unknown): string | null {
  return payloadString(payload, 'message') ?? payloadString(payload, 'error');
}
