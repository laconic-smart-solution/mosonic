import { Injectable } from '@nestjs/common';
import * as mammoth from 'mammoth';
import type { PreprocessedChunk } from '../preprocessed.types';
import { normalizeWhitespace } from '../text-utils';

@Injectable()
export class DocxHandler {
  async toChunk(label: string, buffer: Buffer): Promise<PreprocessedChunk> {
    const result = await mammoth.extractRawText({ buffer });
    return {
      kind: 'text',
      label,
      text: normalizeWhitespace(result.value ?? ''),
    };
  }
}
