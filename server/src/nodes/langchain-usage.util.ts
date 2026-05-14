import { AIMessage, AIMessageChunk } from '@langchain/core/messages';

export type LangchainTokenUsage = {
  inputTokens: number;
  outputTokens: number;
};

/**
 * Reads LangChain v1 usage_metadata from a completed {@link AIMessage}.
 */
export function extractUsageFromAiMessage(
  message: unknown,
): LangchainTokenUsage | undefined {
  if (!AIMessage.isInstance(message)) {
    return undefined;
  }
  const u = message.usage_metadata;
  if (!u || typeof u !== 'object') {
    return undefined;
  }
  const input =
    typeof (u as { input_tokens?: unknown }).input_tokens === 'number'
      ? (u as { input_tokens: number }).input_tokens
      : 0;
  const output =
    typeof (u as { output_tokens?: unknown }).output_tokens === 'number'
      ? (u as { output_tokens: number }).output_tokens
      : 0;
  if (input === 0 && output === 0) {
    return undefined;
  }
  return { inputTokens: input, outputTokens: output };
}

/**
 * Picks the latest non-empty usage from streamed {@link AIMessageChunk}s.
 */
export function extractUsageFromStreamChunk(
  message: unknown,
): LangchainTokenUsage | undefined {
  if (!AIMessageChunk.isInstance(message)) {
    return undefined;
  }
  const u = message.usage_metadata;
  if (!u || typeof u !== 'object') {
    return undefined;
  }
  const input =
    typeof (u as { input_tokens?: unknown }).input_tokens === 'number'
      ? (u as { input_tokens: number }).input_tokens
      : 0;
  const output =
    typeof (u as { output_tokens?: unknown }).output_tokens === 'number'
      ? (u as { output_tokens: number }).output_tokens
      : 0;
  if (input === 0 && output === 0) {
    return undefined;
  }
  return { inputTokens: input, outputTokens: output };
}
