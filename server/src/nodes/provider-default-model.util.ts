import { OPENAI_IMAGE_GENERATION_MODEL } from './openai-image-size.util';
import { LlmProvider } from './workflow-node-llm.enums';

export const OPENAI_DEFAULT_CHAT_MODEL = 'gpt-4o';
export const OPENAI_DEFAULT_TRANSCRIPTION_MODEL = 'whisper-1';

export const GOOGLE_DEFAULT_CHAT_MODEL = 'gemini-2.5-flash';
export const GOOGLE_DEFAULT_IMAGE_MODEL = 'gemini-2.5-flash-image';
export const GOOGLE_DEFAULT_TRANSCRIPTION_MODEL = 'gemini-2.5-flash';

export function resolveProviderFromConfig(provider?: unknown): LlmProvider {
  if (typeof provider === 'string') {
    const normalized = provider.trim().toLowerCase();
    if (
      normalized &&
      (Object.values(LlmProvider) as string[]).includes(normalized)
    ) {
      return normalized as LlmProvider;
    }
  }
  return LlmProvider.OpenAI;
}

/**
 * Resolves a node's execution model matching its configured provider, safely
 * preventing cross-provider stale model ids (e.g. 'gpt-4o' when provider='google').
 */
export function resolveNodeModel(
  requestedModel: unknown,
  provider: unknown,
  capability: 'chat' | 'image' | 'transcription',
): string {
  const resolvedProvider = resolveProviderFromConfig(provider);
  const raw = typeof requestedModel === 'string' ? requestedModel.trim() : '';
  const lower = raw.toLowerCase();

  if (capability === 'image') {
    if (resolvedProvider === LlmProvider.Google) {
      if (raw && (lower.includes('gemini') || lower.startsWith('imagen-'))) {
        return raw;
      }
      return GOOGLE_DEFAULT_IMAGE_MODEL;
    }
    return OPENAI_IMAGE_GENERATION_MODEL;
  }

  if (capability === 'transcription') {
    if (resolvedProvider === LlmProvider.Google) {
      if (raw && lower.includes('gemini')) {
        return raw;
      }
      return GOOGLE_DEFAULT_TRANSCRIPTION_MODEL;
    }
    if (resolvedProvider === LlmProvider.Groq) {
      return 'whisper-large-v3-turbo';
    }
    return OPENAI_DEFAULT_TRANSCRIPTION_MODEL;
  }

  // chat capability
  if (resolvedProvider === LlmProvider.Google) {
    if (
      raw &&
      lower.includes('gemini') &&
      !lower.endsWith('-image') &&
      !lower.includes('-image-') &&
      !lower.startsWith('imagen-')
    ) {
      return raw;
    }
    return GOOGLE_DEFAULT_CHAT_MODEL;
  }

  if (resolvedProvider === LlmProvider.OpenAI) {
    if (
      raw &&
      !lower.includes('gemini') &&
      !lower.startsWith('imagen-') &&
      !lower.startsWith('claude-') &&
      !lower.startsWith('whisper-')
    ) {
      return raw;
    }
    return OPENAI_DEFAULT_CHAT_MODEL;
  }

  return raw || OPENAI_DEFAULT_CHAT_MODEL;
}
