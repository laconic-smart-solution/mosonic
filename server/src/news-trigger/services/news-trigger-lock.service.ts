import {
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import {
  buildRedisConnectionOptions,
  redisEnvFromConfig,
} from '../../config/redis-connection.util';

@Injectable()
export class NewsTriggerLockService implements OnModuleDestroy {
  private readonly logger = new Logger(NewsTriggerLockService.name);
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

  /** Returns true if lock acquired. */
  async tryAcquireDailyLock(ruleId: string, dayKey: string): Promise<boolean> {
    const key = `news:lock:${ruleId}:${dayKey}`;
    const result = await this.getClient().set(key, '1', 'EX', 86400, 'NX');
    return result === 'OK';
  }

  async releaseLock(ruleId: string, dayKey: string): Promise<void> {
    const key = `news:lock:${ruleId}:${dayKey}`;
    try {
      await this.getClient().del(key);
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
