/**
 * Download remote bytes (e.g. HeyGen expiring video_url) for re-upload to file-service.
 */
export async function fetchUrlToBuffer(
  url: string,
  options?: { timeoutMs?: number },
): Promise<{ buffer: Buffer; contentType: string }> {
  const timeoutMs = options?.timeoutMs ?? 120_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(
        `Failed to fetch URL (${response.status} ${response.statusText})`,
      );
    }
    const contentType =
      response.headers.get('content-type')?.trim() ||
      'application/octet-stream';
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) {
      throw new Error('Fetched URL returned empty body');
    }
    return { buffer, contentType };
  } finally {
    clearTimeout(timer);
  }
}
