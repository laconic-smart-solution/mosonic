import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { fileTypeFromBuffer } from 'file-type';
import { DocxHandler } from './handlers/docx.handler';
import { ImageHandler } from './handlers/image.handler';
import { PdfHandler } from './handlers/pdf.handler';
import { TextHandler } from './handlers/text.handler';
import { UrlHandler } from './handlers/url.handler';
import type {
  PreprocessedChunk,
  PreprocessedPayload,
  UploadedFileLike,
} from './preprocessed.types';

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
export class PreprocessingService {
  private readonly logger = new Logger(PreprocessingService.name);

  constructor(
    private readonly pdfHandler: PdfHandler,
    private readonly docxHandler: DocxHandler,
    private readonly textHandler: TextHandler,
    private readonly imageHandler: ImageHandler,
    private readonly urlHandler: UrlHandler,
  ) {}

  async fileToChunk(file: UploadedFileLike): Promise<PreprocessedChunk> {
    const { buffer, originalname } = file;
    const label = originalname || 'attachment';
    const mimeFromMulter = file.mimetype?.toLowerCase() ?? '';
    const ext = extFromName(originalname);

    const sniff = await fileTypeFromBuffer(buffer).catch(() => undefined);
    const mime = sniff?.mime ?? mimeFromMulter;

    if (mime === 'application/pdf' || ext === 'pdf') {
      return this.pdfHandler.toChunk(label, buffer);
    }

    if (
      mime ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      ext === 'docx'
    ) {
      return this.docxHandler.toChunk(label, buffer);
    }

    if (
      mime.startsWith('text/') ||
      ext === 'txt' ||
      ext === 'md' ||
      ext === 'markdown'
    ) {
      return this.textHandler.toChunk(label, buffer);
    }

    if (
      IMAGE_MIME.has(mime) ||
      ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)
    ) {
      const visionMime = this.imageHandler.resolveMime(mime, originalname);
      return this.imageHandler.toChunk(label, buffer, visionMime);
    }

    throw new BadRequestException(
      `Unsupported file type for "${label}" (${mime || ext || 'unknown'}).`,
    );
  }

  /** Builds typed chunks (text or base64 for vision) from uploads and URLs. */
  async resolvePayload(args: {
    userText: string;
    files: UploadedFileLike[];
    urls: string[];
  }): Promise<PreprocessedPayload> {
    const chunks: PreprocessedChunk[] = [];

    for (const f of args.files) {
      try {
        chunks.push(await this.fileToChunk(f));
      } catch (e) {
        if (e instanceof BadRequestException) throw e;
        throw e;
      }
    }

    for (const u of args.urls) {
      const trimmed = u.trim();
      if (!trimmed) continue;
      try {
        chunks.push(await this.urlHandler.fetchAsChunk(trimmed));
      } catch (e) {
        const reason = (e as Error).message || 'fetch failed';
        this.logger.warn(`URL fetch failed for ${trimmed}: ${reason}`);
        // Keep extraction going when sites block scrapers (403/WAF) or TLS fails.
        chunks.push(this.urlHandler.fallbackChunk(trimmed, reason));
      }
    }

    return { userText: args.userText, chunks };
  }
}
