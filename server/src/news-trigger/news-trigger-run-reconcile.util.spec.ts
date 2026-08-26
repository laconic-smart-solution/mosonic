import { Logger } from '@nestjs/common';
import { reconcileRunningManualLog } from './news-trigger-run-reconcile.util';

describe('reconcileRunningManualLog', () => {
  const logger = new Logger('test');

  it('repairs log when Bull job completed but Mongo has no completedAt', async () => {
    const logModel = {
      findOne: jest
        .fn()
        .mockReturnValueOnce({
          lean: () => ({
            exec: () =>
              Promise.resolve({
                runId: 'run-1',
                completedAt: null,
                pipelinesTriggered: 0,
                details: [],
              }),
          }),
        })
        .mockReturnValueOnce({
          lean: () => ({
            exec: () =>
              Promise.resolve({
                runId: 'run-1',
                completedAt: new Date('2026-05-27T10:00:00Z'),
                errorMessage:
                  'Run finished in the queue but the result was not saved. Check worker/API logs and try again.',
                pipelinesTriggered: 0,
                details: [],
              }),
          }),
        }),
      updateOne: jest.fn().mockResolvedValue({ matchedCount: 1 }),
    };

    const bullJob = {
      data: { runId: 'run-1', ruleId: 'rule-1', userId: 'u1' },
      finishedOn: Date.now(),
      getState: jest.fn().mockResolvedValue('completed'),
    };

    const result = await reconcileRunningManualLog(
      logModel as never,
      logger,
      'rule-1',
      { runId: 'run-1' },
      bullJob as never,
    );

    expect(logModel.updateOne).toHaveBeenCalled();
    expect(result?.status).toBe('failed');
  });

  it('ignores Bull job when runId does not match log', async () => {
    const logModel = {
      findOne: jest.fn(),
      updateOne: jest.fn(),
    };
    const bullJob = {
      data: { runId: 'other-run', ruleId: 'rule-1', userId: 'u1' },
      getState: jest.fn().mockResolvedValue('completed'),
    };

    const result = await reconcileRunningManualLog(
      logModel as never,
      logger,
      'rule-1',
      { runId: 'run-1' },
      bullJob as never,
    );

    expect(result).toBeNull();
    expect(logModel.updateOne).not.toHaveBeenCalled();
  });
});
