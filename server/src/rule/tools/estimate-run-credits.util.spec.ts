import {
  creditsFromRawCostUsd,
  estimatePipelineCredits,
  LIST_PRICE_CREDIT_CONFIG,
} from './estimate-run-credits.util';

describe('creditsFromRawCostUsd', () => {
  it('matches CreditCalculationService formula with seed config', () => {
    // image default 0.04 → ceil(0.04 * 3 / 0.01) = 12
    expect(creditsFromRawCostUsd(0.04, LIST_PRICE_CREDIT_CONFIG)).toBe(12);
    // text 0.01 → 3
    expect(creditsFromRawCostUsd(0.01, LIST_PRICE_CREDIT_CONFIG)).toBe(3);
    // adapt 0.008 → ceil(2.4) = 3
    expect(creditsFromRawCostUsd(0.008, LIST_PRICE_CREDIT_CONFIG)).toBe(3);
  });
});

describe('estimatePipelineCredits', () => {
  it('sums list-price credits for a typical FB+TikTok+LI run', () => {
    const est = estimatePipelineCredits([
      { type: 'keyword_planner' },
      { type: 'text_generation' },
      { type: 'adapt', settings: {} },
      { type: 'adapt', settings: {} },
      { type: 'adapt', settings: {} },
      { type: 'image_generation', settings: {} },
      { type: 'image_generation', settings: {} },
      { type: 'image_generation', settings: {} },
    ]);
    // 3 + 3 + 3*3 + 3*12 = 51
    expect(est.images).toBe(3);
    expect(est.credits).toBe(51);
    expect(est.basis).toBe('list_price');
  });
});
