/** Calibrated HeyGen TTS rate — used to fit script word budget to target length. */
export const DEFAULT_HEYGEN_WORDS_PER_SECOND = 3.1;

/** @deprecated Use DEFAULT_HEYGEN_WORDS_PER_SECOND */
export const PRESENTER_WORDS_PER_SECOND = DEFAULT_HEYGEN_WORDS_PER_SECOND;

/** Rewrite when word count exceeds budget × this factor. */
export const REWRITE_THRESHOLD = 1.2;

/** Expand when word count is below budget × this factor. */
export const EXPAND_THRESHOLD = 0.85;

export function resolveHeygenWordsPerSecond(raw?: string | number): number {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  if (typeof raw === 'string') {
    const n = Number(raw.trim());
    if (Number.isFinite(n) && n > 0) return n;
  }
  return DEFAULT_HEYGEN_WORDS_PER_SECOND;
}

/**
 * Calculate word budget for a target duration.
 */
export function calcWordBudget(
  durationSeconds: number,
  wps: number = DEFAULT_HEYGEN_WORDS_PER_SECOND,
): number {
  const clamped = Math.max(4, Math.min(120, durationSeconds));
  return Math.floor(clamped * wps);
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
export function needsRewrite(
  text: string,
  durationSeconds: number,
  wps: number = DEFAULT_HEYGEN_WORDS_PER_SECOND,
): boolean {
  const budget = calcWordBudget(durationSeconds, wps);
  const words = countWords(text);
  return words > budget * REWRITE_THRESHOLD;
}

/**
 * Check if script should be expanded to better fill the target duration.
 */
export function needsExpand(
  text: string,
  durationSeconds: number,
  wps: number = DEFAULT_HEYGEN_WORDS_PER_SECOND,
): boolean {
  const budget = calcWordBudget(durationSeconds, wps);
  const words = countWords(text);
  return words < budget * EXPAND_THRESHOLD;
}

/**
 * HeyGen voice speed to align script length with target duration (0.5–1.5).
 * Values below 1 slow speech and lengthen the video.
 */
export function computePresenterVoiceSpeed(
  wordCount: number,
  targetSeconds: number,
  wps: number = DEFAULT_HEYGEN_WORDS_PER_SECOND,
): number {
  const idealWords = targetSeconds * wps;
  if (idealWords <= 0 || wordCount <= 0) return 1;
  const speed = wordCount / idealWords;
  return Math.max(0.5, Math.min(1.5, speed));
}

/**
 * Simple fallback trim — used when GPT rewrite fails.
 * Cuts to word budget and appends ellipsis.
 */
export function simpleTrim(
  text: string,
  durationSeconds: number,
  wps: number = DEFAULT_HEYGEN_WORDS_PER_SECOND,
): string {
  const budget = calcWordBudget(durationSeconds, wps);
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
