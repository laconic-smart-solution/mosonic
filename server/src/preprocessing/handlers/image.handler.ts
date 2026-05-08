import { Injectable } from '@nestjs/common';
import type { PreprocessedChunk } from '../preprocessed.types';

const IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

function extFromName(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

@Injectable()
export class ImageHandler {
  resolveMime(declaredMime: string | undefined, originalname: string): string {
    const mime = declaredMime?.toLowerCase() ?? '';
    if (mime && IMAGE_MIME.has(mime)) return mime;
    const ext = extFromName(originalname);
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    if (ext === 'png') return 'image/png';
    if (ext === 'gif') return 'image/gif';
    if (ext === 'webp') return 'image/webp';
    return 'image/png';
  }

  toChunk(label: string, buffer: Buffer, mime: string): PreprocessedChunk {
    return {
      kind: 'base64',
      label,
      mime,
      base64: buffer.toString('base64'),
    };
  }
}
