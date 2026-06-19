/** ~150 words/min at normal TTS speed — used to fit script to target presenter length. */
export const PRESENTER_WORDS_PER_SECOND = 2.5;

/** Rewrite when word count exceeds budget × this factor. */
export const REWRITE_THRESHOLD = 1.2;

/**
 * Calculate word budget for a target duration.
 */
export function calcWordBudget(durationSeconds: number): number {
  const clamped = Math.max(4, Math.min(120, durationSeconds));
  return Math.floor(clamped * PRESENTER_WORDS_PER_SECOND);
}

/**
 * Count words in a string.
 */
export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Check if script needs rewriting.
 * Returns true when word count exceeds budget × threshold.
 */
export function needsRewrite(text: string, durationSeconds: number): boolean {
  const budget = calcWordBudget(durationSeconds);
  const words = countWords(text);
  return words > budget * REWRITE_THRESHOLD;
}

/**
 * Simple fallback trim — used when GPT rewrite fails.
 * Cuts to word budget and appends ellipsis.
 */
export function simpleTrim(text: string, durationSeconds: number): string {
  const budget = calcWordBudget(durationSeconds);
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= budget) return text.trim();
  return `${words.slice(0, budget).join(' ')}…`;
}

/**
 * Remove social-post formatting unsuitable for spoken presenter video.
 */
export function sanitizeSpokenScript(text: string): string {
  return text
    .replace(/#[\w\u0E00-\u0E7F\u4e00-\u9fff]+/gu, '')
    .replace(/@[\w.]+/g, '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/^[\s]*[-*•]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * HeyGen avatar video length follows script/audio, not a duration API field.
 * @deprecated Prefer ScriptDurationService.fitScriptToDuration; kept as alias for simpleTrim.
 */
export function trimScriptToTargetDuration(
  script: string,
  targetSeconds: number,
): string {
  return simpleTrim(script, targetSeconds);
}
