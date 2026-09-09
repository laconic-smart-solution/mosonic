import {
  computeVideoInitialDelayMs,
  videoPollIntervalMs,
} from './queue.constants';

describe('queue.constants video poll', () => {
  it('heygen first poll is not forced to 60s for short clips', () => {
    expect(computeVideoInitialDelayMs('heygen', 10)).toBeLessThanOrEqual(
      30_000,
    );
    expect(computeVideoInitialDelayMs('heygen', 10)).toBeGreaterThanOrEqual(
      10_000,
    );
  });

  it('sora first poll scales with estimate without a 60s floor', () => {
    expect(computeVideoInitialDelayMs('sora', 15)).toBe(15_000);
  });

  it('videoPollIntervalMs returns positive intervals', () => {
    expect(videoPollIntervalMs('heygen')).toBeGreaterThan(0);
    expect(videoPollIntervalMs('sora')).toBeGreaterThan(0);
  });
});
