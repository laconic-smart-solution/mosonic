import type { ConfigService } from '@nestjs/config';
import type { RedisOptions } from 'ioredis';

export type RedisEnvSource = {
  REDIS_URL?: string;
  REDIS_HOST?: string;
  REDIS_PORT?: string | number;
  REDIS_PASSWORD?: string;
};

/** Read Redis-related env from Nest ConfigService. */
export function redisEnvFromConfig(config: ConfigService): RedisEnvSource {
  return {
    REDIS_URL: config.get<string>('REDIS_URL'),
    REDIS_HOST: config.get<string>('REDIS_HOST'),
    REDIS_PORT: config.get<string | number>('REDIS_PORT'),
    REDIS_PASSWORD: config.get<string>('REDIS_PASSWORD'),
  };
}

/** Read Redis-related env from `process.env` (worker bootstrap). */
export function redisEnvFromProcess(): RedisEnvSource {
  return {
    REDIS_URL: process.env.REDIS_URL,
    REDIS_HOST: process.env.REDIS_HOST,
    REDIS_PORT: process.env.REDIS_PORT,
    REDIS_PASSWORD: process.env.REDIS_PASSWORD,
  };
}

function redisOptionsFromUrl(url: string): RedisOptions {
  const parsed = new URL(url);
  const options: RedisOptions = {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
  };
  if (parsed.password) {
    options.password = decodeURIComponent(parsed.password);
  }
  if (parsed.username) {
    options.username = decodeURIComponent(parsed.username);
  }
  const db = parsed.pathname?.replace(/^\//, '');
  if (db && /^\d+$/.test(db)) {
    options.db = Number(db);
  }
  return options;
}

/**
 * BullMQ / ioredis connection: uses REDIS_URL when set, otherwise host/port/password.
 */
export function buildRedisConnectionOptions(source: RedisEnvSource): RedisOptions {
  const url = source.REDIS_URL?.trim();
  if (url) {
    return withBullMqConnectionDefaults(redisOptionsFromUrl(url));
  }

  const host = (source.REDIS_HOST ?? '127.0.0.1').trim();
  const port = Number(source.REDIS_PORT ?? 6379);
  const password = source.REDIS_PASSWORD?.trim();

  const options: RedisOptions = { host, port };
  if (password) {
    options.password = password;
  }
  return withBullMqConnectionDefaults(options);
}

/** ioredis settings required for BullMQ workers over flaky / remote Redis. */
function withBullMqConnectionDefaults(
  options: RedisOptions,
): RedisOptions {
  return {
    ...options,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    retryStrategy: (times: number) => Math.min(times * 200, 5_000),
    reconnectOnError: (err: Error) => {
      const msg = err.message.toUpperCase();
      return msg.includes('ECONNRESET') || msg.includes('READONLY');
    },
  };
}

/**
 * Redis URL for ioredis constructors (pub/sub bridge, one-off publish clients).
 * Honors REDIS_URL; otherwise builds from host/port/password.
 */
export function resolveRedisUrl(source: RedisEnvSource): string {
  const explicit = source.REDIS_URL?.trim();
  if (explicit) {
    return explicit;
  }

  const host = (source.REDIS_HOST ?? '127.0.0.1').trim();
  const port = Number(source.REDIS_PORT ?? 6379);
  const password = source.REDIS_PASSWORD?.trim();

  if (password) {
    return `redis://:${encodeURIComponent(password)}@${host}:${port}`;
  }
  return `redis://${host}:${port}`;
}
