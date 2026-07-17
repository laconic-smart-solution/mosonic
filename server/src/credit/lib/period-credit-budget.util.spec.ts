import { periodCreditBudget } from './period-credit-budget.util';

describe('periodCreditBudget', () => {
  it('equals plan allotment when no top-ups', () => {
    expect(
      periodCreditBudget({
        creditsPerMonth: 1000,
        creditsUsed: 800,
        creditsRemaining: 200,
      }),
    ).toBe(1000);
  });

  it('includes top-ups so used can be shown against a larger total', () => {
    expect(
      periodCreditBudget({
        creditsPerMonth: 1000,
        creditsUsed: 1256,
        creditsRemaining: 244,
      }),
    ).toBe(1500);
  });

  it('floors negative remaining at zero for budget math', () => {
    expect(
      periodCreditBudget({
        creditsPerMonth: 1000,
        creditsUsed: 1200,
        creditsRemaining: -50,
      }),
    ).toBe(1200);
  });
});
