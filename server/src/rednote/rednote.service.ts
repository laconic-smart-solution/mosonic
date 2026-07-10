import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { SocialAccountStatus } from '@prisma/client';
import { Queue, QueueEvents } from 'bullmq';
import {
  buildRedisConnectionOptions,
  redisEnvFromConfig,
} from '../config/redis-connection.util';
import { CreditCalculationService } from '../credit/credit-calculation.service';
import { CreditService } from '../credit/credit.service';
import { SOCIAL_ACCOUNT_CONNECT_NODE_TYPE } from '../credit/lib/billable-node-credit-types';
import { NodeCreditPriceService } from '../credit/node-credit-price.service';
import {
  parseRedNoteMetadata,
  REDNOTE_CHANNEL,
} from '../domain/users/rednote-metadata.types';
import type { PublishResult } from '../social/social-publish.types';
import { UsersService } from '../users/users.service';
import { RedNoteAdapter } from './adapters/rednote.adapter';
import {
  isRedNoteSessionInvalidError,
  RedNoteSessionInvalidError,
} from './errors/rednote.errors';
import {
  REDNOTE_LOGIN_QUEUE,
  REDNOTE_PUBLISH_QUEUE,
  rednoteLoginJobId,
  rednoteLoginLockKey,
  rednoteLoginRoom,
  type RedNoteLoginJobData,
  type RedNotePublishJobData,
} from './rednote.constants';
import { RedNoteGateway } from './rednote.gateway';
import { RedNoteLockService } from './rednote-lock.service';

@Injectable()
export class RedNoteService {
  private readonly logger = new Logger(RedNoteService.name);

  constructor(
    private readonly users: UsersService,
    private readonly creditService: CreditService,
    private readonly nodeCreditPriceService: NodeCreditPriceService,
    private readonly creditCalculation: CreditCalculationService,
    private readonly locks: RedNoteLockService,
    private readonly gateway: RedNoteGateway,
    private readonly adapter: RedNoteAdapter,
    private readonly config: ConfigService,
    @InjectQueue(REDNOTE_LOGIN_QUEUE)
    private readonly loginQueue: Queue<RedNoteLoginJobData>,
    @InjectQueue(REDNOTE_PUBLISH_QUEUE)
    private readonly publishQueue: Queue<RedNotePublishJobData>,
  ) {}

  async unlock(userId: string): Promise<{
    unlocked: true;
    alreadyUnlocked: boolean;
  }> {
    const existing = await this.users.findRedNoteAccount(userId);
    if (existing) {
      throw new BadRequestException('RedNote is already connected');
    }
    const creditsEach =
      (await this.nodeCreditPriceService.getActiveCostCredit(
        SOCIAL_ACCOUNT_CONNECT_NODE_TYPE,
      )) ?? 0;
    const config = await this.creditCalculation.getConfig();
    const { alreadyUnlocked } = await this.creditService.unlockSocialChannel({
      userId,
      channel: REDNOTE_CHANNEL,
      credits: creditsEach,
      creditPriceUsd: config.creditPriceUsd,
    });
    return { unlocked: true, alreadyUnlocked };
  }

  async startConnect(userId: string): Promise<{ socketRoom: string }> {
    const creditsEach =
      (await this.nodeCreditPriceService.getActiveCostCredit(
        SOCIAL_ACCOUNT_CONNECT_NODE_TYPE,
      )) ?? 0;
    if (creditsEach > 0) {
      const unlocked = await this.creditService.hasSocialChannelUnlock(
        userId,
        REDNOTE_CHANNEL,
      );
      if (!unlocked) {
        throw new ForbiddenException(
          'Unlock "rednote" before connecting your account',
        );
      }
    }

    const socketRoom = rednoteLoginRoom(userId);
    const jobId = rednoteLoginJobId(userId);
    const lockKey = rednoteLoginLockKey(userId);

    // Idempotent: if a login job is already waiting/active, reuse it so the
    // client can join the socket room instead of getting 409 with no UI.
    const existing = await this.loginQueue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'waiting' || state === 'active' || state === 'delayed') {
        this.logger.log(
          `RedNote login already ${state} for user=${userId}; returning socket room`,
        );
        return { socketRoom };
      }
      await existing.remove().catch(() => undefined);
    }

    // Orphan lock from a crashed worker — clear so a new job can start.
    if (await this.locks.isHeld(lockKey)) {
      this.logger.warn(
        `Clearing orphaned RedNote login lock for user=${userId}`,
      );
      await this.locks.release(lockKey);
    }

    try {
      await this.loginQueue.add(
        'rednote-login',
        { userId },
        {
          jobId,
          attempts: 1,
          removeOnComplete: 20,
          removeOnFail: 50,
        },
      );
    } catch (err) {
      // BullMQ rejects duplicate jobId while active — treat as in-progress OK.
      this.logger.warn(
        `RedNote login enqueue race user=${userId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return { socketRoom };
  }

  /** Latest QR frame for HTTP poll fallback when Socket.IO misses events. */
  getLatestQrFrame(userId: string): { image: string | null } {
    return { image: this.gateway.getLatestQrFrame(userId) };
  }

  /** Cancel an in-flight QR login (user closed the modal). */
  async cancelConnect(userId: string): Promise<{ cancelled: boolean }> {
    const jobId = rednoteLoginJobId(userId);
    const lockKey = rednoteLoginLockKey(userId);
    const job = await this.loginQueue.getJob(jobId);
    if (job) {
      const state = await job.getState();
      if (state === 'waiting' || state === 'delayed') {
        await job.remove().catch(() => undefined);
      }
      // Active jobs finish via lock TTL / worker; we still release the lock so
      // the next Connect is not blocked if the worker is stuck.
    }
    await this.locks.release(lockKey);
    this.gateway.clearQrCache(userId);
    this.gateway.emitToUser(userId, 'login_failed', { reason: 'cancelled' });
    return { cancelled: true };
  }

  async getAccountStatus(userId: string): Promise<{
    connected: boolean;
    status: string;
    sessionStatus: string | null;
    lastVerifiedAt: string | null;
    needsReauth: boolean;
    handle: string | null;
  }> {
    const account = await this.users.findRedNoteAccountAnyStatus(userId);
    if (!account) {
      return {
        connected: false,
        status: 'none',
        sessionStatus: null,
        lastVerifiedAt: null,
        needsReauth: false,
        handle: null,
      };
    }
    const meta = parseRedNoteMetadata(account.metadata);
    const needsReauth =
      account.status === SocialAccountStatus.ERROR ||
      meta?.sessionStatus === 'expired';
    return {
      connected:
        account.status === SocialAccountStatus.ACTIVE &&
        !needsReauth &&
        Boolean(meta?.encryptedCookies),
      status: account.status,
      sessionStatus: meta?.sessionStatus ?? null,
      lastVerifiedAt: meta?.lastVerifiedAt ?? null,
      needsReauth,
      handle: meta?.rednoteUserHandle ?? account.username ?? null,
    };
  }

  async healthCheck(userId: string): Promise<{
    status: 'active' | 'needs_reauth';
  }> {
    const account = await this.users.findRedNoteAccountAnyStatus(userId);
    if (!account) {
      throw new NotFoundException('No RedNote account');
    }
    const status = await this.adapter.checkHealth(account);
    return { status };
  }

  async disconnect(userId: string): Promise<void> {
    await this.users.disconnectRedNote(userId);
    this.logger.log(`RedNote disconnected user=${userId}`);
  }

  getAdapter(): RedNoteAdapter {
    return this.adapter;
  }

  /**
   * Enqueue RedNote publish (non-blocking). Completion is reported via
   * {@link UploadService.finalizeRedNotePublishOutcome}.
   */
  async publishEnqueue(payload: {
    userId: string;
    postId: string;
    uploadId?: string;
    caption: string;
    mediaUrls: string[];
    scheduledAt?: string | null;
  }): Promise<PublishResult> {
    const account = await this.users.findRedNoteAccount(payload.userId);
    if (!account) {
      throw new NotFoundException('RedNote is not connected');
    }
    const context = await this.adapter.getContext(account);
    return await this.adapter.publish(context, {
      userId: payload.userId,
      postId: payload.postId,
      uploadId: payload.uploadId,
      channel: REDNOTE_CHANNEL,
      caption: payload.caption,
      mediaUrls: payload.mediaUrls,
      scheduledAt: payload.scheduledAt,
    });
  }

  /**
   * Enqueue RedNote publish and wait for the browser job to finish.
   * Unconfirmed publishes return needsManualVerification — callers must not auto-retry.
   */
  async publishAndWait(payload: {
    userId: string;
    postId: string;
    uploadId?: string;
    caption: string;
    mediaUrls: string[];
    scheduledAt?: string | null;
  }): Promise<PublishResult> {
    const enqueued = await this.publishEnqueue(payload);

    if (!enqueued.jobId) {
      return enqueued;
    }

    const events = new QueueEvents(REDNOTE_PUBLISH_QUEUE, {
      connection: buildRedisConnectionOptions(
        redisEnvFromConfig(this.config),
      ),
    });
    try {
      const job = await this.publishQueue.getJob(enqueued.jobId);
      if (!job) return enqueued;
      try {
        const result = (await job.waitUntilFinished(
          events,
          Number(this.config.get('REDNOTE_PUBLISH_WAIT_MS') ?? 300_000),
        )) as PublishResult;
        return result ?? enqueued;
      } catch (err) {
        if (isRedNoteSessionInvalidError(err)) {
          throw new RedNoteSessionInvalidError();
        }
        throw err;
      }
    } finally {
      await events.close().catch(() => undefined);
    }
  }
}
