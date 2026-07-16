/** Shared URL helpers for strategy / rule extract inputs. */

/** Ensures an http(s) absolute URL, or returns null if invalid. */
export function normalizeHttpUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`
  try {
    const url = new URL(withScheme)
    if (url.protocol !== "http:" && url.protocol !== "https:") return null
    if (!url.hostname.includes(".")) return null
    return url.toString()
  } catch {
    return null
  }
}

/** Display label without scheme / trailing slash. */
export function urlDisplayLabel(url: string): string {
  return url
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/$/, "")
}

/**
 * Pull http(s) URLs and bare www./domain paths from free text.
 * Used so pasting a link into the prompt still reaches the URL fetcher.
 */
export function extractUrlsFromText(text: string): string[] {
  if (!text.trim()) return []
  const found = new Set<string>()
  const patterned =
    /(?:https?:\/\/|www\.)[^\s<>"'`]+|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?:\/[^\s<>"'`]*)?/gi
  for (const match of text.matchAll(patterned)) {
    let raw = match[0]
    // Strip trailing punctuation common when pasting into sentences.
    raw = raw.replace(/[),.;:!?\]]+$/g, "")
    const normalized = normalizeHttpUrl(raw)
    if (normalized) found.add(normalized)
  }
  return [...found]
}

/** Merge attachment URLs with any URLs found in prompt text (deduped). */
export function collectStrategyUrls(
  text: string,
  attachmentUrls: string[],
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of [...attachmentUrls, ...extractUrlsFromText(text)]) {
    const normalized = normalizeHttpUrl(raw)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    out.push(normalized)
  }
  return out
}
