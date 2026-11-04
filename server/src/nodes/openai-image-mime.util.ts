const OPENAI_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export type OpenAiImageMime = 'image/jpeg' | 'image/png' | 'image/webp';

const MIME_TO_EXT: Record<OpenAiImageMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function asOpenAiMime(value: string | undefined): OpenAiImageMime | null {
  const mime = value?.split(';')[0]?.trim().toLowerCase();
  if (!mime) return null;
  if (mime === 'image/jpg') return 'image/jpeg';
  if (OPENAI_IMAGE_MIMES.has(mime)) return mime as OpenAiImageMime;
  return null;
}

function mimeFromName(value: string | undefined): OpenAiImageMime | null {
  const lower = value?.toLowerCase() ?? '';
  if (/\.jpe?g(\?|$)/i.test(lower) || lower.includes('image/jpeg') || lower.includes('image/jpg')) {
    return 'image/jpeg';
  }
  if (/\.webp(\?|$)/i.test(lower) || lower.includes('image/webp')) {
    return 'image/webp';
  }
  if (/\.png(\?|$)/i.test(lower) || lower.includes('image/png')) {
    return 'image/png';
  }
  return null;
}

function mimeFromMagicBytes(buffer: Buffer): OpenAiImageMime | null {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'image/png';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

/**
 * gpt-image-2 edit only accepts jpeg/png/webp. File-service often returns
 * application/octet-stream; sniff bytes, then filename, then declared mime.
 */
export function coerceOpenAiImageMime(args: {
  buffer: Buffer;
  declaredMime?: string;
  fileName?: string;
}): { mimeType: OpenAiImageMime; ext: string } {
  const mime =
    mimeFromMagicBytes(args.buffer) ??
    mimeFromName(args.fileName) ??
    asOpenAiMime(args.declaredMime) ??
    'image/png';
  return { mimeType: mime, ext: MIME_TO_EXT[mime] };
}
