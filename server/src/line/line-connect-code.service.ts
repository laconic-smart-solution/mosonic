import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import Redis from 'ioredis';
import {
  buildRedisConnectionOptions,
  redisEnvFromConfig,
} from '../config/redis-connection.util';

const CODE_TTL_SECONDS = 10 * 60;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

@Injectable()
export class LineConnectCodeService implements OnModuleDestroy {
  private readonly redis: Redis;

  constructor(config: ConfigService) {
    this.redis = new Redis(
      buildRedisConnectionOptions(redisEnvFromConfig(config)),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }

  async issue(
    userId: string,
  ): Promise<{ code: string; expiresInSeconds: number }> {
    const uid = userId.trim();
    const previous = await this.redis.get(this.userKey(uid));
    if (previous) {
      await this.redis.del(this.codeKey(previous));
    }

    let code = this.generateCode();
    for (let attempt = 0; attempt < 5; attempt++) {
      const set = await this.redis.set(
        this.codeKey(code),
        uid,
        'EX',
        CODE_TTL_SECONDS,
        'NX',
      );
      if (set === 'OK') {
        await this.redis.set(this.userKey(uid), code, 'EX', CODE_TTL_SECONDS);
        return { code, expiresInSeconds: CODE_TTL_SECONDS };
      }
      code = this.generateCode();
    }

    throw new Error('Failed to allocate LINE connect code');
  }

  async peekForUser(userId: string): Promise<{
    code: string;
    expiresInSeconds: number;
  } | null> {
    const code = await this.redis.get(this.userKey(userId.trim()));
    if (!code) return null;
    const ttl = await this.redis.ttl(this.codeKey(code));
    if (ttl <= 0) return null;
    return { code, expiresInSeconds: ttl };
  }

  /** Consume a code: returns local userId, or null if invalid/expired. */
  async consume(code: string): Promise<string | null> {
    const normalized = code.trim().toUpperCase();
    if (!normalized) return null;
    const userId = await this.redis.get(this.codeKey(normalized));
    if (!userId) return null;
    await this.redis.del(this.codeKey(normalized), this.userKey(userId));
    return userId;
  }

  private generateCode(length = 6): string {
    const bytes = randomBytes(length);
    let out = '';
    for (let i = 0; i < length; i++) {
      out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    }
    return out;
  }

  private codeKey(code: string): string {
    return `line:connect:code:${code.trim().toUpperCase()}`;
  }

  private userKey(userId: string): string {
    return `line:connect:user:${userId.trim()}`;
  }
}
