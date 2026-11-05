import { LLM_TOKEN_RATE_DEFAULTS } from './lib/llm-token-rate.defaults';
import { LlmTokenRateService } from './llm-token-rate.service';
import type { ILlmTokenRateRepository } from '../repositories/interfaces/llm-token-rate.repository.interface';
import type { CreditCalculationService } from './credit-calculation.service';

describe('LlmTokenRateService', () => {
  const rates = {
    listAll: jest.fn().mockResolvedValue([]),
    findActiveByProviderModel: jest.fn().mockResolvedValue(null),
    findByProviderModel: jest.fn().mockResolvedValue(null),
    upsertByProviderModel: jest.fn().mockImplementation((row) =>
      Promise.resolve({ ...row, isActive: true, llmTokenRateId: 'id' }),
    ),
  } as unknown as ILlmTokenRateRepository;

  const calculation = {
    calculateCredits: jest.fn().mockImplementation(async (raw: number) => ({
      rawCostUsd: raw,
      overheadUsd: 0,
      marginAppliedUsd: raw * 3,
      creditsCharged: Math.ceil((raw * 3) / 0.01),
      creditPriceUsdSnapshot: 0.01,
    })),
    getConfig: jest.fn().mockResolvedValue({
      creditPriceUsd: 0.01,
      marginTarget: 3,
      overheadFactor: 0,
    }),
  } as unknown as CreditCalculationService;

  const service = new LlmTokenRateService(rates, calculation);

  beforeEach(() => {
    jest.clearAllMocks();
    (rates.findActiveByProviderModel as jest.Mock).mockResolvedValue(null);
    (calculation.calculateCredits as jest.Mock).mockImplementation(
      async (raw: number) => ({
        rawCostUsd: raw,
        overheadUsd: 0,
        marginAppliedUsd: raw * 3,
        creditsCharged: Math.ceil((raw * 3) / 0.01),
        creditPriceUsdSnapshot: 0.01,
      }),
    );
  });

  it('quotes Luna tokens using built-in defaults when no DB row exists', async () => {
    const quote = await service.quoteTokens({
      model: 'gpt-6-luna',
      inputTokens: 50_000,
      outputTokens: 2_000,
    });
    expect(quote?.rawCostUsd).toBeCloseTo(0.006, 8);
    expect(quote?.creditsCharged).toBe(2);
    expect(quote?.model).toBe('gpt-6-luna');
  });

  it('prefers an admin-saved rate over the default', async () => {
    (rates.findActiveByProviderModel as jest.Mock).mockResolvedValue({
      provider: 'openai',
      model: 'gpt-6-luna',
      inputPerMToken: 1,
      outputPerMToken: 1,
      reasoningPerMToken: null,
      isActive: true,
    });
    const quote = await service.quoteTokens({
      model: 'gpt-6-luna',
      inputTokens: 1_000_000,
      outputTokens: 0,
    });
    expect(quote?.rawCostUsd).toBe(1);
    expect(quote?.creditsCharged).toBe(300);
  });

  it('returns null when the model has no rate', async () => {
    const quote = await service.quoteTokens({
      model: 'totally-unknown-model',
      inputTokens: 10_000,
      outputTokens: 10,
    });
    expect(quote).toBeNull();
  });

  it('ships OpenAI standard list prices (USD / 1M, 2026-11-03)', () => {
    const byModel = Object.fromEntries(
      LLM_TOKEN_RATE_DEFAULTS.map((r) => [r.model, r]),
    );
    expect(byModel['gpt-6-luna']).toMatchObject({
      inputPerMToken: 0.1,
      outputPerMToken: 0.5,
    });
    expect(byModel['gpt-5.4-mini']).toMatchObject({
      inputPerMToken: 0.75,
      outputPerMToken: 4.5,
    });
    expect(byModel['gpt-4o']).toMatchObject({
      inputPerMToken: 2.5,
      outputPerMToken: 10,
    });
    expect(byModel['gpt-4o-mini']).toMatchObject({
      inputPerMToken: 0.15,
      outputPerMToken: 0.6,
    });
    expect(byModel['gpt-4.1']).toMatchObject({
      inputPerMToken: 2,
      outputPerMToken: 8,
    });
    expect(byModel['gpt-4.1-mini']).toMatchObject({
      inputPerMToken: 0.4,
      outputPerMToken: 1.6,
    });
  });
});
