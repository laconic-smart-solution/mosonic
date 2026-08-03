import { withQueueCleanupTimeout } from './queue-cleanup-timeout.util';

describe('withQueueCleanupTimeout', () => {
  const logger = { warn: jest.fn() };

  beforeEach(() => {
    logger.warn.mockClear();
  });

  it('resolves once the work completes, without waiting for the timeout', async () => {
    let ran = false;
    await withQueueCleanupTimeout(
      'test',
      async () => {
        ran = true;
      },
      logger,
      50,
    );
    expect(ran).toBe(true);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('swallows a rejected work promise and logs a warning instead of throwing', async () => {
    await expect(
      withQueueCleanupTimeout(
        'test',
        async () => {
          throw new Error('boom');
        },
        logger,
        50,
      ),
    ).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('test failed'),
    );
  });

  it('resolves within the timeout even when the work never settles (e.g. Redis unreachable)', async () => {
    const neverResolves = new Promise<void>(() => {});
    const start = Date.now();
    await withQueueCleanupTimeout('stuck-queue', () => neverResolves, logger, 30);
    expect(Date.now() - start).toBeLessThan(1000);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('timed out after 30ms'),
    );
  });
});
