import type { Content } from '../content/schemas/content.schema';
import type { Upload, UploadChannelEntry } from '../upload/schemas/upload.schema';

function firstNonEmpty(...values: Array<string | null | undefined>): string {
  for (const v of values) {
    const s = typeof v === 'string' ? v.trim() : '';
    if (s) return s;
  }
  return '';
}

function truncateOneLine(input: string, max = 72): string {
  const one = input.replace(/\s+/g, ' ').trim();
  if (!one) return '';
  if (one.length <= max) return one;
  return `${one.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function deriveContentTitle(content: Partial<Content> | null): string {
  const outputs = (content as { outputs?: { summary?: string; text?: string } } | null)
    ?.outputs;
  const userEdits = (content as { userEdits?: { summary?: string; text?: string } } | null)
    ?.userEdits;

  const raw = firstNonEmpty(
    userEdits?.summary,
    outputs?.summary,
    userEdits?.text,
    outputs?.text,
  );
  const title = truncateOneLine(raw, 80);
  return title || 'Content item';
}

function pickBestChannelEntry(
  channels: UploadChannelEntry[] | undefined,
): UploadChannelEntry | null {
  if (!channels?.length) return null;
  const byTitle = channels.find((c) => typeof c.youtubeTitle === 'string' && c.youtubeTitle.trim().length > 0);
  if (byTitle) return byTitle;
  const byCaption = channels.find((c) => typeof c.caption === 'string' && c.caption.trim().length > 0);
  if (byCaption) return byCaption;
  return channels[0] ?? null;
}

export function deriveUploadLabel(upload: Partial<Upload> | null): string {
  const channels = (upload as { channels?: UploadChannelEntry[] } | null)?.channels;
  const ch = pickBestChannelEntry(channels);
  const raw = firstNonEmpty(ch?.youtubeTitle ?? undefined, ch?.caption ?? undefined);
  const label = truncateOneLine(raw, 64);
  return label || 'Upload';
}

