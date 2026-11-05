/** Shared across chat tools that accept a user-supplied URL (create_rule_from_intake, fetch_website_assets). */
export function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

const PLACEHOLDER_HOSTS = new Set([
  'example.com',
  'example.org',
  'example.net',
  'localhost',
  'yourwebsite.com',
  'yourdomain.com',
  'website.com',
  'domain.com',
]);

const RESERVED_SUFFIXES = ['.example', '.test', '.invalid', '.localhost', '.local'];

function bareHost(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, '').replace(/^www\./, '');
}

/** Placeholder / reserved / loopback hosts a model tends to invent. */
export function isPlaceholderUrl(value: string): boolean {
  let host: string;
  try {
    host = bareHost(new URL(value).hostname);
  } catch {
    return true;
  }
  if (!host) return true;
  if (PLACEHOLDER_HOSTS.has(host)) return true;
  for (const base of ['example.com', 'example.org', 'example.net']) {
    if (host.endsWith(`.${base}`)) return true;
  }
  if (RESERVED_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;
  if (/^(127\.|0\.0\.0\.0$|10\.|192\.168\.|::1$|\[::1\]$)/.test(host)) return true;
  return false;
}

/**
 * True when the URL's host (ignoring "www.") appears in one of the user's
 * messages, e.g. they typed "starbucks.co.th" or pasted the full link.
 */
export function isUrlFromUser(value: string, userTexts: string[]): boolean {
  let host: string;
  try {
    host = bareHost(new URL(value).hostname);
  } catch {
    return false;
  }
  if (!host) return false;
  return userTexts.some((text) => text.toLowerCase().includes(host));
}

/**
 * Returns a reason string when the model's URL must not be used, or null when
 * it is fine. `userTexts` is optional: without it only format and
 * placeholder checks run.
 */
export function rejectUntrustedUrl(
  value: string,
  userTexts?: string[],
): string | null {
  if (!isValidHttpUrl(value)) {
    return `"${value}" is not a usable link (it must start with http:// or https://).`;
  }
  if (isPlaceholderUrl(value)) {
    return `"${value}" is a placeholder address, not the brand's website.`;
  }
  if (userTexts && !isUrlFromUser(value, userTexts)) {
    return `Neither the user nor a web search in this chat gave "${value}".`;
  }
  return null;
}
