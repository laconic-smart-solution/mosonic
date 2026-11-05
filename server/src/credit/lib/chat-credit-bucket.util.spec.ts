import { applyChatCreditBucket } from './chat-credit-bucket.util';

describe('applyChatCreditBucket', () => {
  const price = 0.01;

  it('does not charge until billed USD reaches one credit', () => {
    const first = applyChatCreditBucket({
      unbilledUsd: 0,
      addUsd: 0.004,
      creditPriceUsd: price,
    });
    expect(first).toEqual({ creditsCharged: 0, unbilledUsd: 0.004 });

    const second = applyChatCreditBucket({
      unbilledUsd: first.unbilledUsd,
      addUsd: 0.004,
      creditPriceUsd: price,
    });
    expect(second).toEqual({ creditsCharged: 0, unbilledUsd: 0.008 });

    const third = applyChatCreditBucket({
      unbilledUsd: second.unbilledUsd,
      addUsd: 0.005,
      creditPriceUsd: price,
    });
    expect(third.creditsCharged).toBe(1);
    expect(third.unbilledUsd).toBeCloseTo(0.003, 8);
  });

  it('charges multiple whole credits from one expensive turn and keeps the fraction', () => {
    const result = applyChatCreditBucket({
      unbilledUsd: 0,
      addUsd: 0.018,
      creditPriceUsd: price,
    });
    expect(result.creditsCharged).toBe(1);
    expect(result.unbilledUsd).toBeCloseTo(0.008, 8);
  });

  it('charges two credits when billed USD is an exact multiple', () => {
    expect(
      applyChatCreditBucket({
        unbilledUsd: 0,
        addUsd: 0.02,
        creditPriceUsd: price,
      }),
    ).toEqual({ creditsCharged: 2, unbilledUsd: 0 });
  });
});
