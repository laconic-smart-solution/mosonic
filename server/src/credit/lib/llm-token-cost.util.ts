export type LlmTokenRateQuote = {
  inputPerMToken: number;
  outputPerMToken: number;
  reasoningPerMToken?: number | null;
};

/** OpenAI-style USD: (tokens / 1M) × price-per-million. */
export function rawUsdFromTokens(
  tokens: {
    inputTokens: number;
    outputTokens: number;
    reasoningTokens?: number;
  },
  rate: LlmTokenRateQuote,
): number {
  const input = Math.max(0, tokens.inputTokens);
  const output = Math.max(0, tokens.outputTokens);
  const reasoning = Math.max(0, tokens.reasoningTokens ?? 0);
  const reasoningRate = rate.reasoningPerMToken ?? 0;
  return (
    (input / 1_000_000) * rate.inputPerMToken +
    (output / 1_000_000) * rate.outputPerMToken +
    (reasoning / 1_000_000) * reasoningRate
  );
}

export const CHAT_CREDIT_NODE_TYPE = 'chat' as const;

/** Sample turn used on the admin preview column (not billed). */
export const ADMIN_TOKEN_RATE_SAMPLE = {
  inputTokens: 50_000,
  outputTokens: 2_000,
} as const;
