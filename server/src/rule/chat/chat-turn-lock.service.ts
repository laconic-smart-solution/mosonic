import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import {
  buildRedisConnectionOptions,
  redisEnvFromConfig,
} from '../../config/redis-connection.util';

/** Upper bound for one chat turn; the lock expires on its own if a process dies mid-turn. */
export const CHAT_TURN_LOCK_TTL_MS = 5 * 60 * 1000;

const RELEASE_IF_OWNER = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;

/**
 * Per-session lock so two turns on the same chat session cannot run at once
 * (across API instances). SET NX PX with a random token; release only if we
 * still own it.
 */
@Injectable()
export class ChatTurnLockService implements OnModuleDestroy {
  private readonly logger = new Logger(ChatTurnLockService.name);
  private client: Redis | null = null;

  constructor(private readonly config: ConfigService) {}

  private getClient(): Redis {
    if (!this.client) {
      this.client = new Redis(
        buildRedisConnectionOptions(redisEnvFromConfig(this.config)),
      );
    }
    return this.client;
  }

  private key(sessionId: string) {
    return `chat:turn-lock:${sessionId}`;
  }

  /** Returns the owner token when acquired, or null when another turn holds the lock. */
  async tryAcquire(sessionId: string): Promise<string | null> {
    const token = randomUUID();
    const result = await this.getClient().set(
      this.key(sessionId),
      token,
      'PX',
      CHAT_TURN_LOCK_TTL_MS,
      'NX',
    );
    return result === 'OK' ? token : null;
  }

  async release(sessionId: string, token: string): Promise<void> {
    const key = this.key(sessionId);
    try {
      await this.getClient().eval(RELEASE_IF_OWNER, 1, key, token);
    } catch (err) {
      this.logger.warn(
        `Failed to release lock ${key}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
    }
  }
}
