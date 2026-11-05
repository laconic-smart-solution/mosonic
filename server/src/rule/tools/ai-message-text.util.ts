/**
 * Pulls the user-visible string out of an AIMessage `content` value.
 * Chat Completions is a string; the Responses API (gpt-6-luna) is an array of
 * `{ type, text, annotations, phase }` parts. JSON.stringifying those parts is
 * what leaked into the chat bubble.
 */
export function extractAiMessageText(content: unknown): string {
  const raw = collectText(content).trim();
  return unwrapResponsesTextJson(raw);
}

function collectText(content: unknown): string {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => collectText(part))
      .filter(Boolean)
      .join('\n');
  }
  if (typeof content === 'object') {
    const part = content as Record<string, unknown>;
    if (typeof part.text === 'string') return part.text;
    if (typeof part.output_text === 'string') return part.output_text;
    if (part.content !== undefined) return collectText(part.content);
  }
  return '';
}

function looksLikeResponsesPart(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const part = value as Record<string, unknown>;
  return (
    typeof part.text === 'string' &&
    (part.type === 'text' ||
      part.type === 'output_text' ||
      part.phase === 'final_answer' ||
      Array.isArray(part.annotations))
  );
}

/** If a prior path already stringified a Responses part, recover the inner text. */
function unwrapResponsesTextJson(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return text;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    const inner = collectText(parsed).trim();
    if (!inner || inner === trimmed) return text;
    if (looksLikeResponsesPart(parsed)) return inner;
    if (Array.isArray(parsed) && parsed.some(looksLikeResponsesPart)) return inner;
  } catch {
    // not JSON — leave the original reply
  }
  return text;
}
