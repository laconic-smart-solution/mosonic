import { Injectable } from '@nestjs/common';
import type { PreprocessedChunk } from '../preprocessed.types';

@Injectable()
export class PdfHandler {
  /** Raw PDF bytes as base64 for the content-reading step (GPT-4o multimodal). */
  toChunk(label: string, buffer: Buffer): PreprocessedChunk {
    return {
      kind: 'base64',
      label,
      mime: 'application/pdf',
      base64: buffer.toString('base64'),
    };
  }
}
