import { ConfigService } from '@nestjs/config';
import { WebsiteAssetHandler } from './website-asset.handler';

// Isolate from real DNS/network — assertUrlSafeForFetch's SSRF guard is
// covered separately by url-safety.spec.ts.
jest.mock('../url-safety', () => ({
  assertUrlSafeForFetch: jest.fn((rawUrl: string) => Promise.resolve(new URL(rawUrl))),
}));
// file-type is ESM-only and not transformable under this repo's Jest config
// (see preprocessing.service.ts/rule.service.spec.ts for the same pattern) —
// mock it so content-type sniffing just falls back to the response header.
jest.mock('file-type', () => ({
  fileTypeFromBuffer: jest.fn().mockResolvedValue(undefined),
}));

const PAGE_URL = 'http://example.com/';

const HTML = `
<html>
<head>
  <link rel="icon" href="/favicon.png" />
  <meta property="og:image" content="https://cdn.example.com/og.jpg" />
</head>
<body>
  <header><img src="/logo.svg" alt="Example logo" /></header>
  <main>
    <img class="product-photo" data-src="/product-1.jpg" src="/placeholder-blank.gif" alt="" />
  </main>
  <img src="/team-photo.jpg" alt="Our team at the office" />
  <img src="/social-icon-fb.png" alt="Facebook" />
  <img src="/decorative.png" width="20" height="20" />
  <img src="/no-alt-no-signal.png" />
</body>
</html>
`;

function pngBytes() {
  return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}

describe('WebsiteAssetHandler', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  function mockFetchSequence(
    responses: Array<{ ok: boolean; contentType: string; body: Buffer | string }>,
  ) {
    let call = 0;
    global.fetch = jest.fn().mockImplementation(() => {
      const next = responses[call++];
      const bodyBuf =
        typeof next.body === 'string' ? Buffer.from(next.body) : next.body;
      return Promise.resolve({
        ok: next.ok,
        status: next.ok ? 200 : 404,
        headers: { get: () => next.contentType },
        body: {
          getReader: () => {
            let done = false;
            return {
              read: () => {
                if (done) return Promise.resolve({ done: true, value: undefined });
                done = true;
                return Promise.resolve({ done: false, value: new Uint8Array(bodyBuf) });
              },
            };
          },
        },
        arrayBuffer: () => Promise.resolve(bodyBuf.buffer),
      } as unknown as Response);
    }) as unknown as typeof fetch;
  }

  it('ranks icon/og above content/generic images and caps at maxImages', async () => {
    mockFetchSequence([
      { ok: true, contentType: 'text/html', body: HTML },
      { ok: true, contentType: 'image/png', body: pngBytes() }, // favicon.png
      { ok: true, contentType: 'image/svg+xml', body: pngBytes() }, // logo.svg
    ]);

    const handler = new WebsiteAssetHandler(new ConfigService({}));
    const images = await handler.discoverImages(PAGE_URL, 2);

    expect(images).toHaveLength(2);
    expect(images[0].sourceUrl).toBe('http://example.com/favicon.png');
    expect(images[0].kind).toBe('icon');
    expect(images[1].sourceUrl).toBe('http://example.com/logo.svg');
    expect(images[1].kind).toBe('icon');
  });

  it('follows lazy-load data-src, and filters noise/tiny/unsignaled generic images', async () => {
    mockFetchSequence([
      { ok: true, contentType: 'text/html', body: HTML },
      { ok: true, contentType: 'image/png', body: pngBytes() }, // favicon.png
      { ok: true, contentType: 'image/svg+xml', body: pngBytes() }, // logo.svg
      { ok: true, contentType: 'image/jpeg', body: pngBytes() }, // og.jpg
      { ok: true, contentType: 'image/jpeg', body: pngBytes() }, // product-1.jpg (via data-src)
      { ok: true, contentType: 'image/jpeg', body: pngBytes() }, // team-photo.jpg
    ]);

    const handler = new WebsiteAssetHandler(new ConfigService({}));
    const images = await handler.discoverImages(PAGE_URL, 10);

    const sourceUrls = images.map((i) => i.sourceUrl);
    // Lazy-loaded product image resolved via data-src, not the blank.gif placeholder in src.
    expect(sourceUrls).toContain('http://example.com/product-1.jpg');
    expect(sourceUrls).not.toContain('http://example.com/placeholder-blank.gif');
    // Alt-bearing content image kept.
    expect(sourceUrls).toContain('http://example.com/team-photo.jpg');
    // Noise pattern (social icon), tiny dimensions, and no-alt generic images excluded.
    expect(sourceUrls).not.toContain('http://example.com/social-icon-fb.png');
    expect(sourceUrls).not.toContain('http://example.com/decorative.png');
    expect(sourceUrls).not.toContain('http://example.com/no-alt-no-signal.png');
    expect(images).toHaveLength(5);
  });

  it('excludes a "trusted by" partner-logo wall, even with src/alt matching "logo"', async () => {
    const trustWallHtml = `
<html>
<body>
  <header><img src="/brand-logo.png" alt="Our Brand Logo" /></header>
  <div class="trusted-by-marquee">
    <img src="/trust-by-logos/marriott.png" alt="Marriott" />
    <img src="/trust-by-logos/hilton.png" alt="Hilton" />
  </div>
</body>
</html>
`;
    mockFetchSequence([
      { ok: true, contentType: 'text/html', body: trustWallHtml },
      { ok: true, contentType: 'image/png', body: pngBytes() }, // brand-logo.png
    ]);

    const handler = new WebsiteAssetHandler(new ConfigService({}));
    const images = await handler.discoverImages(PAGE_URL, 10);

    const sourceUrls = images.map((i) => i.sourceUrl);
    expect(sourceUrls).toEqual(['http://example.com/brand-logo.png']);
    expect(sourceUrls).not.toContain('http://example.com/trust-by-logos/marriott.png');
    expect(sourceUrls).not.toContain('http://example.com/trust-by-logos/hilton.png');
  });

  it('throws when the page itself is not HTML', async () => {
    mockFetchSequence([{ ok: true, contentType: 'application/json', body: '{}' }]);

    const handler = new WebsiteAssetHandler(new ConfigService({}));
    await expect(handler.discoverImages(PAGE_URL, 3)).rejects.toThrow(
      'URL did not return an HTML page',
    );
  });
});
