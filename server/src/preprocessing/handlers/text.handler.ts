import { Injectable } from '@nestjs/common';
import type { PreprocessedChunk } from '../preprocessed.types';
import { normalizeWhitespace } from '../text-utils';

@Injectable()
export class TextHandler {
  toChunk(label: string, buffer: Buffer): PreprocessedChunk {
    return {
      kind: 'text',
      label,
      text: normalizeWhitespace(buffer.toString('utf8')),
    };
  }
}
