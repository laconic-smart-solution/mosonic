import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as cheerio from 'cheerio';
import { fileTypeFromBuffer } from 'file-type';
import type { PreprocessedChunk } from '../preprocessed.types';
import { readResponseBodyLimited } from '../read-response-body';
import { assertUrlSafeForFetch } from '../url-safety';
import { normalizeWhitespace } from '../text-utils';
import { extractPdfText } from '../pdf-text';
import { PdfHandler } from './pdf.handler';
import { DocxHandler } from './docx.handler';
import { TextHandler } from './text.handler';
import { ImageHandler } from './image.handler';

@Injectable()
export class UrlHandler {
  private readonly logger = new Logger(UrlHandler.name);

  constructor(
    private readonly config: ConfigService,
    private readonly pdfHandler: PdfHandler,
    private readonly docxHandler: DocxHandler,
    private readonly textHandler: TextHandler,
    private readonly imageHandler: ImageHandler,
  ) {}

  private urlMaxBytes(): number {
    const raw = this.config.get<string>('RULE_EXTRACT_URL_MAX_BYTES');
    const n = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(n) && n > 0 ? n : 2_000_000;
  }

  private urlTimeoutMs(): number {
    const raw = this.config.get<string>('RULE_EXTRACT_URL_TIMEOUT_MS');
    const n = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(n) && n > 0 ? n : 15_000;
  }

  async fetchAsChunk(urlString: string): Promise<PreprocessedChunk> {
    const url = await assertUrlSafeForFetch(urlString);
    const maxBytes = this.urlMaxBytes();
    const timeoutMs = this.urlTimeoutMs();
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ac.signal,
        redirect: 'follow',
        headers: { 'User-Agent': 'NeutralTex-RuleExtract/1.0' },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const buf = await readResponseBodyLimited(res, maxBytes);
      const ct = res.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
      const label = urlString.trim();

      if (
        ct === 'application/pdf' ||
        buf.subarray(0, 5).toString() === '%PDF-'
      ) {
        return this.pdfHandler.toChunk(label, buf);
      }

      if (ct.includes('html') || buf.subarray(0, 512).includes(60)) {
        const html = buf.toString('utf8');
        const $ = cheerio.load(html);
        $('script, style, noscript').remove();
        const text = normalizeWhitespace($('body').text() || $.root().text());
        return { kind: 'text', label, text };
      }

      if (ct.startsWith('text/')) {
        return this.textHandler.toChunk(label, buf);
      }

      const sniff = await fileTypeFromBuffer(buf).catch(() => undefined);
      const sniffMime = sniff?.mime ?? '';
      const filename = url.pathname.split('/').pop() || 'download';

      if (
        sniffMime ===
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        filename.endsWith('.docx')
      ) {
        return this.docxHandler.toChunk(label, buf);
      }

      if (sniffMime.startsWith('image/')) {
        const mime = this.imageHandler.resolveMime(sniffMime, filename);
        return this.imageHandler.toChunk(label, buf, mime);
      }

      if (sniffMime === 'application/pdf') {
        return this.pdfHandler.toChunk(label, buf);
      }

      try {
        const text = await extractPdfText(buf);
        if (text.trim()) {
          return {
            kind: 'text',
            label,
            text: normalizeWhitespace(text),
          };
        }
      } catch {
        this.logger.debug(`PDF text fallback failed for URL ${label}`);
      }

      throw new BadRequestException(
        `Unsupported content from URL (${ct || sniffMime || 'unknown'})`,
      );
    } finally {
      clearTimeout(to);
    }
  }
}
