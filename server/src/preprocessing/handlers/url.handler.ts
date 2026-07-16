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

const BROWSER_LIKE_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9,th;q=0.8',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
};

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

  /**
   * When the live page cannot be read (WAF/403, TLS, timeout), still return a
   * usable text chunk so rule extraction can continue from the URL + context.
   */
  fallbackChunk(urlString: string, reason: string): PreprocessedChunk {
    const label = urlString.trim();
    return {
      kind: 'text',
      label,
      text: normalizeWhitespace(
        [
          `Reference URL: ${label}`,
          `Page content could not be fetched (${reason}).`,
          'Infer brand name, industry, audience, tone, and campaign strategy from the URL domain/path and any other user-provided context.',
        ].join('\n'),
      ),
    };
  }

  async fetchAsChunk(urlString: string): Promise<PreprocessedChunk> {
    const url = await assertUrlSafeForFetch(urlString);
    const maxBytes = this.urlMaxBytes();
    const timeoutMs = this.urlTimeoutMs();
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), timeoutMs);
    const label = urlString.trim();
    try {
      const res = await fetch(url, {
        signal: ac.signal,
        redirect: 'follow',
        headers: BROWSER_LIKE_HEADERS,
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const buf = await readResponseBodyLimited(res, maxBytes);
      const ct = res.headers.get('content-type')?.split(';')[0]?.trim() ?? '';

      if (
        ct === 'application/pdf' ||
        buf.subarray(0, 5).toString() === '%PDF-'
      ) {
        return this.pdfHandler.toChunk(label, buf);
      }

      if (ct.includes('html') || buf.subarray(0, 512).includes(60)) {
        const html = buf.toString('utf8');
        const $ = cheerio.load(html);
        $('script, style, noscript, iframe, svg').remove();
        const title = normalizeWhitespace($('title').first().text());
        const metaDescription = normalizeWhitespace(
          $('meta[name="description"]').attr('content') ||
            $('meta[property="og:description"]').attr('content') ||
            '',
        );
        const bodyText = normalizeWhitespace(
          $('body').text() || $.root().text(),
        );
        const parts = [
          title ? `Title: ${title}` : '',
          metaDescription ? `Description: ${metaDescription}` : '',
          bodyText,
        ].filter(Boolean);
        const text = parts.join('\n\n');
        if (!text.trim()) {
          throw new Error('Empty HTML page');
        }
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
