import { isFinalJobAttempt } from './job-attempt.util';

describe('isFinalJobAttempt', () => {
  it('is not final while BullMQ still has retries scheduled (finishedOn unset)', () => {
    // A mid-retry attempt: BullMQ's Worker 'failed' event fires here too,
    // but the job is going to be retried, so finishedOn stays unset.
    expect(isFinalJobAttempt({ finishedOn: undefined })).toBe(false);
    expect(isFinalJobAttempt({ finishedOn: null as never })).toBe(false);
  });

  it('is final once BullMQ sets finishedOn (attempts exhausted, discarded, or UnrecoverableError)', () => {
    expect(isFinalJobAttempt({ finishedOn: Date.now() })).toBe(true);
  });
});
