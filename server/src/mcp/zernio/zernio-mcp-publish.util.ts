/**
 * Parse Zernio MCP `callTool` results that embed JSON in text content blocks.
 */
export function extractPostIdFromMcpCreateResult(result: unknown): string {
  const text = stringifyMcpToolResult(result);
  if (!text.trim()) return '';
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const post =
      parsed.post && typeof parsed.post === 'object'
        ? (parsed.post as Record<string, unknown>)
        : null;
    const id =
      typeof parsed._id === 'string'
        ? parsed._id
        : typeof parsed.id === 'string'
          ? parsed.id
          : typeof parsed.postId === 'string'
            ? parsed.postId
            : typeof post?._id === 'string'
              ? post._id
              : typeof post?.id === 'string'
                ? post.id
                : '';
    return id.trim();
  } catch {
    return extractPostIdFromPythonLikeMcpResult(text);
  }
}

function extractPostIdFromPythonLikeMcpResult(text: string): string {
  const postMatch =
    /['"]post['"]\s*:\s*\{([\s\S]*)\}\s*,\s*['"]message['"]/.exec(text);
  const source = postMatch?.[1] ?? text;
  const ids = Array.from(
    source.matchAll(/['"]_id['"]\s*:\s*['"]([^'"]+)['"]/g),
    (match) => match[1]?.trim() ?? '',
  ).filter(Boolean);

  return ids.at(-1) ?? '';
}

/** Concatenate MCP `text` blocks / structured content (shared by publish + getPost parsers). */
export function stringifyMcpToolResult(result: unknown): string {
  if (result == null) return '';
  if (typeof result === 'string') return result;
  if (typeof result !== 'object') return String(result);
  const r = result as Record<string, unknown>;
  const content = r.content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (!block || typeof block !== 'object') return '';
        const b = block as Record<string, unknown>;
        if (b.type === 'text' && typeof b.text === 'string') return b.text;
        return '';
      })
      .join('');
  }
  const structured = r.structuredContent;
  if (structured != null) {
    try {
      return typeof structured === 'string'
        ? structured
        : JSON.stringify(structured);
    } catch {
      return '';
    }
  }
  return '';
}

/** Parse JSON from MCP tool `content` text blocks; returns null on empty or invalid JSON. */
export function parseMcpToolJson(result: unknown): unknown | null {
  const text = stringifyMcpToolResult(result).trim();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/** User-facing errors for publish failures (Zernio / network). */
export function getFriendlyZernioPublishError(err: unknown): string {
  const msg =
    err instanceof Error
      ? err.message.toLowerCase()
      : typeof err === 'string'
        ? err.toLowerCase()
        : '';

  if (msg.includes('rate limit'))
    return 'Service is busy. Please retry in a moment.';
  if (msg.includes('unauthorized') || msg.includes('auth'))
    return 'Account authorization failed. Please reconnect your account.';
  if (msg.includes('not connected') || msg.includes('no account'))
    return 'Social account is not connected. Please connect in Settings.';
  if (msg.includes('timeout')) return 'Request timed out. Please retry.';
  return 'Publishing failed. Please retry.';
}
