export type LlmTokenRateDefault = {
  provider: string;
  model: string;
  inputPerMToken: number;
  outputPerMToken: number;
  reasoningPerMToken?: number | null;
};

/**
 * OpenAI Standard API list prices (USD per 1M tokens), short context.
 * https://developers.openai.com/api/docs/pricing (checked 2026-11-03)
 * Luna: https://developers.openai.com/api/docs/models/gpt-6-luna ($0.10 in / $0.50 out)
 *
 * Reasoning is billed as output on these models.
 */
export const LLM_TOKEN_RATE_DEFAULTS: readonly LlmTokenRateDefault[] = [
  {
    provider: 'openai',
    model: 'gpt-6-luna',
    inputPerMToken: 0.1,
    outputPerMToken: 0.5,
    reasoningPerMToken: null,
  },
  {
    provider: 'openai',
    model: 'gpt-5.4-mini',
    inputPerMToken: 0.75,
    outputPerMToken: 4.5,
    reasoningPerMToken: null,
  },
  {
    provider: 'openai',
    model: 'gpt-4o',
    inputPerMToken: 2.5,
    outputPerMToken: 10,
    reasoningPerMToken: null,
  },
  {
    provider: 'openai',
    model: 'gpt-4o-mini',
    inputPerMToken: 0.15,
    outputPerMToken: 0.6,
    reasoningPerMToken: null,
  },
  {
    provider: 'openai',
    model: 'gpt-4.1',
    inputPerMToken: 2,
    outputPerMToken: 8,
    reasoningPerMToken: null,
  },
  {
    provider: 'openai',
    model: 'gpt-4.1-mini',
    inputPerMToken: 0.4,
    outputPerMToken: 1.6,
    reasoningPerMToken: null,
  },
];

export function defaultRateForModel(
  provider: string,
  model: string,
): LlmTokenRateDefault | undefined {
  const p = provider.trim().toLowerCase();
  const m = model.trim();
  return LLM_TOKEN_RATE_DEFAULTS.find(
    (row) => row.provider === p && row.model === m,
  );
}
