import {
  buildRedisConnectionOptions,
  resolveRedisUrl,
} from './redis-connection.util';

describe('redis-connection.util', () => {
  it('builds host/port/password options when REDIS_URL is unset', () => {
    expect(
      buildRedisConnectionOptions({
        REDIS_HOST: '192.168.0.242',
        REDIS_PORT: 6379,
        REDIS_PASSWORD: 'secret',
      }),
    ).toEqual({
      host: '192.168.0.242',
      port: 6379,
      password: 'secret',
    });
  });

  it('parses REDIS_URL for BullMQ when set', () => {
    expect(
      buildRedisConnectionOptions({
        REDIS_URL: 'redis://:pw@10.0.0.1:6379',
        REDIS_PASSWORD: 'ignored',
      }),
    ).toEqual({
      host: '10.0.0.1',
      port: 6379,
      password: 'pw',
    });
  });

  it('URL-encodes password in resolveRedisUrl', () => {
    expect(
      resolveRedisUrl({
        REDIS_HOST: '127.0.0.1',
        REDIS_PORT: 6379,
        REDIS_PASSWORD: 'p@ss:word',
      }),
    ).toBe('redis://:p%40ss%3Aword@127.0.0.1:6379');
  });
});
