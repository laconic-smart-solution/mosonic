/** Normalized presign response from `POST /v1/media/presign`. */
export type ZernioPresignResult = {
  uploadUrl: string;
  publicUrl: string;
  expires?: string;
};

export function normalizePresignResponse(
  data: unknown,
): ZernioPresignResult | null {
  if (!data || typeof data !== 'object') return null;
  const o = data as Record<string, unknown>;
  const uploadUrl = pickString(o.uploadUrl ?? o.upload_url);
  const publicUrl = pickString(o.publicUrl ?? o.public_url);
  if (!uploadUrl || !publicUrl) return null;
  const expires = pickString(o.expires ?? o.expires_at);
  return { uploadUrl, publicUrl, ...(expires ? { expires } : {}) };
}

function pickString(v: unknown): string {
  return typeof v === 'string' && v.trim() ? v.trim() : '';
}

const VIDEO_EXT = /\.(mp4|webm|mov|m4v|mkv|avi)(\?|#|$)/i;
const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp)(\?|#|$)/i;

/** Hosts that already serve Zernio-accessible media (skip re-upload). */
export function isLikelyZernioAccessibleMediaUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const h = u.hostname.toLowerCase();
    if (h.endsWith('.googleapis.com') || h === 'storage.googleapis.com') {
      return true;
    }
    if (h.endsWith('zernio.com') || h.endsWith('.zernio.com')) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function leafFileNameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const seg = u.pathname.split('/').filter(Boolean).pop();
    if (seg && !seg.includes('..')) return decodeURIComponent(seg);
  } catch {
    /* ignore */
  }
  const pathOnly = url.split(/[?#]/)[0] ?? '';
  const leaf = pathOnly.split('/').pop();
  if (leaf && leaf.length > 0) return leaf;
  return 'zernio-media.bin';
}

/**
 * MIME for presign `fileType` (Zernio docs: e.g. image/jpeg).
 * Prefer response Content-Type when valid; else infer from filename.
 */
export function resolvePresignMime(
  contentTypeHeader: string | null | undefined,
  fileName: string,
): string {
  const raw =
    (contentTypeHeader ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  if (
    raw &&
    raw !== 'application/octet-stream' &&
    !raw.startsWith('text/html') &&
    !raw.startsWith('text/plain')
  ) {
    return raw;
  }

  const lower = fileName.toLowerCase();
  if (VIDEO_EXT.test(lower)) {
    if (lower.endsWith('.webm')) return 'video/webm';
    if (lower.endsWith('.mov')) return 'video/quicktime';
    if (lower.endsWith('.avi')) return 'video/x-msvideo';
    return 'video/mp4';
  }
  if (IMAGE_EXT.test(lower)) {
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.gif')) return 'image/gif';
    if (lower.endsWith('.webp')) return 'image/webp';
    return 'image/jpeg';
  }
  if (lower.endsWith('.pdf')) return 'application/pdf';

  return 'application/octet-stream';
}

export function zernioMediaItemTypeFromMime(mime: string): 'image' | 'video' {
  const m = mime.toLowerCase();
  if (m.startsWith('video/')) return 'video';
  return 'image';
}

export function assertPdfNotUsedForPresign(mime: string): void {
  if (mime.toLowerCase() === 'application/pdf') {
    throw new Error(
      'Zernio publish failed: PDF media is not supported via this upload path (use LinkedIn-specific flows if applicable).',
    );
  }
}

/**
 * Minimal magic-byte sniffing to avoid `file-type` (ESM) in Jest.
 * Returns a best-effort `{ mime, ext }` for common image/video types.
 */
export function sniffMimeFromBytes(
  bytes: Uint8Array,
): { mime: string; ext: string } | null {
  if (!bytes?.length) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { mime: 'image/png', ext: 'png' };
  }

  // JPEG: FF D8 FF
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }

  // GIF: GIF87a / GIF89a
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return { mime: 'image/gif', ext: 'gif' };
  }

  // WebP: RIFF....WEBP
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { mime: 'image/webp', ext: 'webp' };
  }

  // WebM: 1A 45 DF A3
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    return { mime: 'video/webm', ext: 'webm' };
  }

  // MP4/MOV: ftyp at offset 4
  if (
    bytes.length >= 12 &&
    bytes[4] === 0x66 && // f
    bytes[5] === 0x74 && // t
    bytes[6] === 0x79 && // y
    bytes[7] === 0x70 // p
  ) {
    // brand is bytes[8..11]
    const brand = String.fromCharCode(
      bytes[8],
      bytes[9],
      bytes[10],
      bytes[11],
    ).toLowerCase();
    if (brand.includes('qt')) return { mime: 'video/quicktime', ext: 'mov' };
    return { mime: 'video/mp4', ext: 'mp4' };
  }

  return null;
}
