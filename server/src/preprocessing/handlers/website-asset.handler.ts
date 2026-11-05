import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as cheerio from 'cheerio';
import { fileTypeFromBuffer } from 'file-type';
import { readResponseBodyLimited } from '../read-response-body';
import { assertUrlSafeForFetch } from '../url-safety';

const BROWSER_LIKE_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,image/avif,image/webp,*/*;q=0.8',
};

export type DiscoveredImageKind = 'icon' | 'og' | 'content' | 'img';

export type DiscoveredImage = {
  sourceUrl: string;
  buffer: Buffer;
  mimeType: string;
  originalFileName: string;
  kind: DiscoveredImageKind;
};

type Candidate = { url: string; kind: DiscoveredImageKind };

const KIND_RANK: Record<DiscoveredImageKind, number> = {
  icon: 0,
  og: 1,
  content: 2,
  img: 3,
};

/** UI chrome, not brand content — social/payment badges, spinners, trackers, decorative icons. */
const NOISE_PATTERN =
  /(sprite|spacer|pixel[-._]|blank\.(gif|png)|1x1\.(gif|png)|placeholder|loading|spinner|avatar|badge|rating|star[-_]|arrow|chevron|bullet|social[-_]icon|payment[-_]icon|flag[-_]icon|emoji|tracking)/i;

/**
 * Other companies' logos displayed ON this page (client/partner walls,
 * "as seen in" press strips, testimonial avatars) — not this brand's own
 * imagery, even though the images are real content with real alt text.
 */
const FOREIGN_BRAND_CONTAINER_PATTERN =
  /(marquee|carousel|trusted[-_]?by|partner|sponsor|client[-_]?logo|clients[-_]|press[-_]?logo|press[-_]?strip|brand[-_]?wall|logos?[-_]?(strip|row|wall|grid)|testimonial|as[-_]?seen[-_]?in)/i;

const PLACEHOLDER_SRC_PATTERN =
  /^data:image\/gif;base64|blank\.(gif|png)$|1x1\.(gif|png)$/i;

/** Structural subset of Cheerio's wrapped-element API — avoids pinning to cheerio's own type exports. */
type AttrSource = { attr(name: string): string | undefined };

/** Modern sites lazy-load the real image into data-src/srcset and leave a tiny placeholder in src. */
function pickSrc($el: AttrSource): string | undefined {
  const src = $el.attr('src');
  if (src && !PLACEHOLDER_SRC_PATTERN.test(src)) return src;

  const dataSrc =
    $el.attr('data-src') || $el.attr('data-lazy-src') || $el.attr('data-original');
  if (dataSrc) return dataSrc;

  const srcset = $el.attr('srcset');
  if (srcset) {
    const first = srcset.split(',')[0]?.trim().split(/\s+/)[0];
    if (first) return first;
  }

  return src;
}

/** Best-effort: only filters when width/height attributes are actually present. */
function isTinyDimension($el: AttrSource): boolean {
  const w = parseInt($el.attr('width') || '', 10);
  const h = parseInt($el.attr('height') || '', 10);
  if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
    return w < 40 || h < 40;
  }
  return false;
}

function isNoise($el: AttrSource, src: string): boolean {
  const alt = $el.attr('alt') || '';
  const classAndId = `${$el.attr('class') || ''} ${$el.attr('id') || ''}`;
  return (
    NOISE_PATTERN.test(src) ||
    NOISE_PATTERN.test(alt) ||
    NOISE_PATTERN.test(classAndId)
  );
}

/**
 * Pulls candidate brand images (favicon/logo, og:image, header/nav <img>s)
 * out of a page's HTML and downloads them — reuses the same SSRF guard and
 * byte/time limits as rule-extraction's URL handling (preprocessing/url-safety.ts).
 */
@Injectable()
export class WebsiteAssetHandler {
  private readonly logger = new Logger(WebsiteAssetHandler.name);

  constructor(private readonly config: ConfigService) {}

  private maxBytes(): number {
    const raw = this.config.get<string>('RULE_EXTRACT_URL_MAX_BYTES');
    const n = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(n) && n > 0 ? Math.min(n, 5_000_000) : 5_000_000;
  }

  private timeoutMs(): number {
    const raw = this.config.get<string>('RULE_EXTRACT_URL_TIMEOUT_MS');
    const n = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(n) && n > 0 ? n : 15_000;
  }

  private async fetchBuffer(
    url: URL,
  ): Promise<{ buf: Buffer; contentType: string }> {
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), this.timeoutMs());
    try {
      const res = await fetch(url, {
        signal: ac.signal,
        redirect: 'follow',
        headers: BROWSER_LIKE_HEADERS,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await readResponseBodyLimited(res, this.maxBytes());
      const contentType =
        res.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
      return { buf, contentType };
    } finally {
      clearTimeout(to);
    }
  }

  private collectCandidates(html: string, baseUrl: URL): Candidate[] {
    const $ = cheerio.load(html);
    const seen = new Set<string>();
    const out: Candidate[] = [];

    const addCandidate = (raw: string | undefined, kind: DiscoveredImageKind) => {
      if (!raw?.trim()) return;
      let abs: string;
      try {
        abs = new URL(raw, baseUrl).toString();
      } catch {
        return;
      }
      if (seen.has(abs)) return;
      seen.add(abs);
      out.push({ url: abs, kind });
    };

    /** Walks a few ancestors up for "client logo wall / press strip / testimonial" containers. */
    const hasForeignBrandAncestor = ($el: ReturnType<typeof $>): boolean =>
      $el
        .parents()
        .slice(0, 6)
        .toArray()
        .some((p) => FOREIGN_BRAND_CONTAINER_PATTERN.test($(p).attr('class') || ''));

    // Logo/favicon signals — always kept, highest priority. Positional
    // (header/nav) detection only, not a page-wide "logo" keyword match:
    // "logo" in a src/class/alt also matches client-logo walls and partner
    // badges elsewhere on the page, which are NOT this brand's own imagery.
    $('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]').each(
      (_, el) => addCandidate($(el).attr('href'), 'icon'),
    );
    addCandidate($('meta[property="og:image"]').attr('content'), 'og');
    addCandidate($('meta[name="twitter:image"]').attr('content'), 'og');
    $('header img, nav img').each((_, el) => {
      const $el = $(el);
      if (hasForeignBrandAncestor($el)) return;
      addCandidate(pickSrc($el), 'icon');
    });

    // Content images: inside semantic containers or product/hero/gallery-tagged —
    // the actual brand photography a feed/post would use, not UI chrome.
    $(
      'main img, article img, img[class*="hero" i], img[class*="banner" i], ' +
        'img[class*="gallery" i], img[class*="product" i], img[class*="portfolio" i], ' +
        'img[class*="project" i]',
    ).each((_, el) => {
      const $el = $(el);
      const src = pickSrc($el);
      if (!src || isNoise($el, src) || isTinyDimension($el) || hasForeignBrandAncestor($el)) {
        return;
      }
      addCandidate(src, 'content');
    });

    // Everything else — only keep images with real alt text as a last-resort
    // signal that they're meaningful content, not decorative chrome/ads.
    $('img').each((_, el) => {
      const $el = $(el);
      const src = pickSrc($el);
      const alt = ($el.attr('alt') || '').trim();
      if (
        !src ||
        !alt ||
        isNoise($el, src) ||
        isTinyDimension($el) ||
        hasForeignBrandAncestor($el)
      ) {
        return;
      }
      addCandidate(src, 'img');
    });

    return out.sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind]);
  }

  async discoverImages(
    urlString: string,
    maxImages: number,
  ): Promise<DiscoveredImage[]> {
    const pageUrl = await assertUrlSafeForFetch(urlString);
    const { buf: htmlBuf, contentType } = await this.fetchBuffer(pageUrl);
    if (!contentType.includes('html')) {
      throw new Error('URL did not return an HTML page');
    }

    const candidates = this.collectCandidates(htmlBuf.toString('utf8'), pageUrl);
    const images: DiscoveredImage[] = [];

    for (const candidate of candidates) {
      if (images.length >= maxImages) break;

      let assetUrl: URL;
      try {
        assetUrl = await assertUrlSafeForFetch(candidate.url);
      } catch {
        continue;
      }

      try {
        const { buf, contentType: assetContentType } =
          await this.fetchBuffer(assetUrl);
        const sniff = await fileTypeFromBuffer(buf).catch(() => undefined);
        const mimeType = sniff?.mime ?? assetContentType;
        if (!mimeType.startsWith('image/')) continue;

        images.push({
          sourceUrl: candidate.url,
          buffer: buf,
          mimeType,
          originalFileName: assetUrl.pathname.split('/').pop() || 'image',
          kind: candidate.kind,
        });
      } catch (err) {
        this.logger.debug(
          `Skipping asset ${candidate.url}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return images;
  }
}
