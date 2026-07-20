import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import {
  buildRedisConnectionOptions,
  redisEnvFromConfig,
} from '../config/redis-connection.util';

@Injectable()
export class RedNoteLockService implements OnModuleDestroy {
  private readonly redis: Redis;

  constructor(config: ConfigService) {
    this.redis = new Redis(
      buildRedisConnectionOptions(redisEnvFromConfig(config)),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }

  async tryAcquire(key: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.redis.set(key, '1', 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  async isHeld(key: string): Promise<boolean> {
    return (await this.redis.exists(key)) === 1;
  }

  async release(key: string): Promise<void> {
    await this.redis.del(key);
  }
}
