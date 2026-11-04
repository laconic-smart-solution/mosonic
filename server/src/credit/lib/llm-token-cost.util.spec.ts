import { rawUsdFromTokens } from './llm-token-cost.util';

describe('rawUsdFromTokens', () => {
  it('prices Luna input and output separately', () => {
    const usd = rawUsdFromTokens(
      { inputTokens: 50_000, outputTokens: 2_000 },
      { inputPerMToken: 0.1, outputPerMToken: 0.5 },
    );
    expect(usd).toBeCloseTo(0.006, 8);
  });

  it('adds reasoning tokens when a rate is set', () => {
    const usd = rawUsdFromTokens(
      { inputTokens: 1_000_000, outputTokens: 0, reasoningTokens: 1_000_000 },
      { inputPerMToken: 0.1, outputPerMToken: 0.5, reasoningPerMToken: 0.1 },
    );
    expect(usd).toBeCloseTo(0.2, 8);
  });

  it('treats missing reasoning rate as zero', () => {
    const usd = rawUsdFromTokens(
      { inputTokens: 0, outputTokens: 0, reasoningTokens: 9_000 },
      { inputPerMToken: 0.1, outputPerMToken: 0.5 },
    );
    expect(usd).toBe(0);
  });
});
