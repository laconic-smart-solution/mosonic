/**
 * Collapses immediately-repeated lines (a model occasionally echoes the same
 * sentence twice in a row — a sampling artifact, not an intentional repeat).
 */
export function dedupeConsecutiveLines(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  for (const line of lines) {
    const prev = out[out.length - 1];
    if (prev !== undefined && prev.trim() === line.trim() && line.trim() !== '') continue;
    out.push(line);
  }
  return out.join('\n');
}

/** Matches `Thought: ...`, also with markdown emphasis (`**Thought:**`). */
const THOUGHT_PREFIX = /^\s*[*_]{0,2}thought[*_]{0,2}\s*:\s*[*_]{0,2}\s*/i;

/**
 * Splits a model reply into a Thought line and the user-facing answer.
 * Leading `Thought:` lines (one or several) become the thought; the rest
 * (after optional blank lines) is the answer. The answer never starts with
 * a raw `Thought:` prefix - a Thought-only reply yields an empty answer.
 */
export function splitThoughtAndAnswer(content: string): {
  thought: string | null;
  answer: string;
} {
  const trimmed = content.trim();
  if (!trimmed) return { thought: null, answer: '' };

  const lines = trimmed.split('\n');
  const thoughts: string[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (THOUGHT_PREFIX.test(line)) {
      thoughts.push(line.replace(THOUGHT_PREFIX, '').trim());
      index += 1;
      continue;
    }
    // Blank lines between stacked Thought lines are skipped.
    if (thoughts.length > 0 && !line.trim()) {
      index += 1;
      continue;
    }
    break;
  }
  if (thoughts.length === 0) {
    return { thought: null, answer: dedupeConsecutiveLines(trimmed) };
  }

  const thought = thoughts.filter(Boolean).join(' ').trim();
  const rest = lines.slice(index).join('\n').trim();
  return { thought: thought || null, answer: dedupeConsecutiveLines(rest) };
}
