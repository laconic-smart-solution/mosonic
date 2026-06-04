import { PostingFrequency } from '../rule/schemas/rule.schema';
import { computeNextRunAt } from './campaign-schedule.util';

describe('computeNextRunAt', () => {
  it('advances daily cadence by one day', () => {
    const from = new Date('2026-05-17T12:00:00Z');
    const next = computeNextRunAt(PostingFrequency.Daily, '', from);
    expect(next.getDate()).toBe(18);
  });

  it('advances weekly cadence by seven days', () => {
    const from = new Date('2026-05-17T12:00:00Z');
    const next = computeNextRunAt(PostingFrequency.Weekly, '', from);
    expect(next.getTime() - from.getTime()).toBeGreaterThanOrEqual(
      6 * 24 * 60 * 60 * 1000,
    );
  });
});
