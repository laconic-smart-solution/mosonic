import { POLL_CONFIG, videoCheckJobId } from './queue.constants';

describe('queue.constants', () => {
  it('video poll defaults approximate 30 minute timeout', () => {
    const { initialDelayMs, intervalMs, maxChecks } = POLL_CONFIG.video;
    const worstCaseMs = initialDelayMs + (maxChecks - 1) * intervalMs;
    expect(worstCaseMs).toBeGreaterThanOrEqual(29 * 60 * 1000);
    expect(worstCaseMs).toBeLessThanOrEqual(31 * 60 * 1000);
  });

  it('videoCheckJobId is unique per attempt', () => {
    expect(videoCheckJobId('p1', 'n1', 0)).toBe('p1__n1__check__0');
    expect(videoCheckJobId('p1', 'n1', 1)).toBe('p1__n1__check__1');
  });
});
