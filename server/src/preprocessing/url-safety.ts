import * as dns from 'node:dns/promises';
import * as net from 'node:net';

/** Ensures http(s) scheme so `new URL` and fetch accept pasted host paths. */
export function normalizeHttpUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new Error('Invalid URL');
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

/** Best-effort normalize; returns null when not a usable http(s) URL. */
export function tryNormalizeHttpUrl(rawUrl: string): string | null {
  try {
    const withScheme = normalizeHttpUrl(rawUrl);
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname.includes('.')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Pull http(s) URLs and bare www./domain paths from free text so pasted links
 * still reach the URL fetcher even when not sent in the `urls` field.
 */
export function extractUrlsFromText(text: string): string[] {
  if (!text.trim()) return [];
  const found = new Set<string>();
  const patterned =
    /(?:https?:\/\/|www\.)[^\s<>"'`]+|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?:\/[^\s<>"'`]*)?/gi;
  for (const match of text.matchAll(patterned)) {
    let raw = match[0];
    raw = raw.replace(/[),.;:!?\]]+$/g, '');
    const normalized = tryNormalizeHttpUrl(raw);
    if (normalized) found.add(normalized);
  }
  return [...found];
}

/** Merge explicit URL list with any URLs found in prompt text (deduped, normalized). */
export function mergeUrlSources(text: string, urls: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [...urls, ...extractUrlsFromText(text)]) {
    const normalized = tryNormalizeHttpUrl(raw);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

export function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h === '0.0.0.0') return true;
  if (h.endsWith('.local') || h.endsWith('.internal')) return true;
  return false;
}

export function isBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 0) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::1') return true;
    if (lower.startsWith('fe80:')) return true;
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
    if (lower.startsWith('ff')) return true;
    return false;
  }
  return true;
}

/** Throws Error with reason string if URL must not be fetched (SSRF guard). */
export async function assertUrlSafeForFetch(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(normalizeHttpUrl(rawUrl));
  } catch (e) {
    if (e instanceof Error && e.message === 'Invalid URL') throw e;
    throw new Error('Invalid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only HTTP(S) URLs are allowed');
  }
  if (isBlockedHostname(url.hostname)) {
    throw new Error('Host is not allowed');
  }
  if (net.isIP(url.hostname)) {
    if (isBlockedIp(url.hostname)) {
      throw new Error('Address is not allowed');
    }
    return url;
  }
  let lookupHost = url.hostname;
  if (lookupHost.startsWith('[') && lookupHost.endsWith(']')) {
    lookupHost = lookupHost.slice(1, -1);
  }
  const { address } = await dns.lookup(lookupHost);
  if (isBlockedIp(address)) {
    throw new Error('Resolved address is not allowed');
  }
  return url;
}
