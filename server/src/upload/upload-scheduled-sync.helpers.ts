export type SyncPostDecision =
  | { kind: 'noop_scheduled' }
  | { kind: 'mark_published'; at: Date }
  | { kind: 'mark_failed'; message: string }
  | { kind: 'not_found' };

function extractStatusString(parsed: unknown): string {
  if (!parsed || typeof parsed !== 'object') return '';
  const o = parsed as Record<string, unknown>;
  const direct = o.status ?? o.state ?? o.postStatus;
  if (typeof direct === 'string') return direct;
  const post = o.post;
  if (post && typeof post === 'object') {
    const p = post as Record<string, unknown>;
    if (typeof p.status === 'string') return p.status;
  }
  const data = o.data;
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    if (typeof d.status === 'string') return d.status;
  }
  return '';
}

export function interpretZernioPostForSync(
  parsed: unknown | null,
): SyncPostDecision {
  if (parsed == null) return { kind: 'not_found' };
  const status = extractStatusString(parsed);
  const s = status.trim().toLowerCase();
  if (
    s === 'published' ||
    s === 'live' ||
    s === 'succeeded' ||
    s === 'success'
  ) {
    return { kind: 'mark_published', at: new Date() };
  }
  if (
    s === 'scheduled' ||
    s === 'pending' ||
    s === 'processing' ||
    s === 'queued' ||
    s === 'publishing' ||
    s === 'draft'
  ) {
    return { kind: 'noop_scheduled' };
  }
  if (s === 'failed' || s === 'error') {
    return { kind: 'mark_failed', message: 'Publishing failed on platform.' };
  }
  if (s === 'cancelled' || s === 'canceled') {
    return { kind: 'mark_failed', message: 'Post was cancelled.' };
  }
  return { kind: 'noop_scheduled' };
}

export async function mapWithConcurrencyLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const cap = Math.max(1, Math.floor(limit));
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const idx = next++;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx]);
    }
  }

  const workers = Array.from({ length: Math.min(cap, items.length) }, () =>
    worker(),
  );
  await Promise.all(workers);
  return results;
}
