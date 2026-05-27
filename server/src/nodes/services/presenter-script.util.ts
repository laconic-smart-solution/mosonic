/** ~150 words/min at normal TTS speed — used to trim script to target presenter length. */
export const PRESENTER_WORDS_PER_SECOND = 2.5;

/**
 * HeyGen avatar video length follows script/audio, not a duration API field.
 * Trim upstream copy to approximate the user's target duration (seconds).
 */
export function trimScriptToTargetDuration(
  script: string,
  targetSeconds: number,
): string {
  const trimmed = script.trim();
  if (!trimmed) return trimmed;

  const seconds =
    typeof targetSeconds === 'number' && Number.isFinite(targetSeconds)
      ? Math.max(4, Math.min(120, targetSeconds))
      : 8;
  const maxWords = Math.max(1, Math.floor(seconds * PRESENTER_WORDS_PER_SECOND));
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) {
    return trimmed;
  }
  return `${words.slice(0, maxWords).join(' ')}…`;
}
