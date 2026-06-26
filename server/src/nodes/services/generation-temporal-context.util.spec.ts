import { formatGenerationTemporalContext } from './generation-temporal-context.util';

describe('formatGenerationTemporalContext', () => {
  it('includes ISO date and present-tense guidance', () => {
    const fixed = new Date('2026-06-25T12:00:00.000Z');
    const block = formatGenerationTemporalContext(fixed);
    expect(block).toContain('2026-06-25');
    expect(block).toContain('June 25, 2026');
    expect(block).toContain('Do not reference past calendar years');
  });
});
