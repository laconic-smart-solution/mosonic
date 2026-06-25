/**
 * Shared "today" anchor for LLM generation prompts (UTC).
 * Reduces stale years (e.g. 2024) when models lack live web context.
 */
export function formatGenerationTemporalContext(now: Date = new Date()): string {
  const iso = now.toISOString().slice(0, 10);
  const human = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });

  return [
    '=== CURRENT DATE (UTC) ===',
    `Today is ${human} (${iso}).`,
    'Write as if publishing in the present.',
    'Do not reference past calendar years (e.g. 2024) unless the user brief, intelligence brief, or source material explicitly requires historical context.',
  ].join('\n');
}
