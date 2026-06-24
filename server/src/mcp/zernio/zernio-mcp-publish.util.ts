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

import { isAxiosError } from 'axios';

/** Pull user-facing `error` text from Zernio REST 4xx bodies. */
export function extractZernioApiErrorMessage(err: unknown): string | null {
  if (!isAxiosError(err)) {
    if (err instanceof Error && err.message.trim()) return err.message.trim();
    return null;
  }
  const data = err.response?.data;
  if (typeof data === 'object' && data !== null) {
    const rec = data as Record<string, unknown>;
    if (typeof rec.error === 'string' && rec.error.trim()) return rec.error.trim();
    if (typeof rec.message === 'string' && rec.message.trim()) {
      return rec.message.trim();
    }
  }
  if (typeof data === 'string' && data.trim()) return data.trim();
  return null;
}

/** User-facing errors for publish failures (Zernio / network). */
export function getFriendlyZernioPublishError(err: unknown): string {
  const apiMsg = extractZernioApiErrorMessage(err);
  const raw = apiMsg ?? (err instanceof Error ? err.message : typeof err === 'string' ? err : '');
  const msg = raw.toLowerCase();

  if (
    msg.includes('tiktok') &&
    (msg.includes('slideshow title') || msg.includes('90 character'))
  ) {
    return 'TikTok photo posts use your caption as the slideshow title (90 characters max). Shorten the caption and try again.';
  }
  if (msg.includes('rate limit'))
    return 'Service is busy. Please retry in a moment.';
  if (msg.includes('unauthorized') || msg.includes('auth'))
    return 'Account authorization failed. Please reconnect your account.';
  if (msg.includes('not connected') || msg.includes('no account'))
    return 'Social account is not connected. Please connect in Settings.';
  if (msg.includes('timeout')) return 'Request timed out. Please retry.';

  if (apiMsg && apiMsg.length <= 240) return apiMsg;

  return 'Publishing failed. Please retry.';
}
