export const DEFAULT_CONTEXT_LIMIT = 128_000;

export const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,
  'gpt-4.1': 1_047_576,
  'gpt-4.1-mini': 1_047_576,
  'o4-mini': 200_000,
  'gpt-5-mini': 200_000,
  'gpt-5.4-mini': 200_000,
  'gpt-6-luna': 1_050_000,
  'gpt-6-sol': 1_050_000,
  'gpt-6-astra': 1_050_000,
  'claude-3-5-sonnet-latest': 200_000,
  'gemini-1.5-pro': 2_000_000,
  'gemini-2.0-flash': 1_048_576,
  'gemini-2.5-flash': 1_048_576,
  'gemini-2.5-pro': 1_048_576,
};

export function resolveModelContextLimit(model?: string): number {
  if (!model?.trim()) return DEFAULT_CONTEXT_LIMIT;
  return MODEL_CONTEXT_LIMITS[model.trim()] ?? DEFAULT_CONTEXT_LIMIT;
}
