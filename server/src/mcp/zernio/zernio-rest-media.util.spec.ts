import {
  assertPdfNotUsedForPresign,
  isLikelyZernioAccessibleMediaUrl,
  leafFileNameFromUrl,
  normalizePresignResponse,
  resolvePresignMime,
  sniffMimeFromBytes,
  zernioMediaItemTypeFromMime,
} from './zernio-rest-media.util';

describe('normalizePresignResponse', () => {
  it('reads camelCase fields', () => {
    expect(
      normalizePresignResponse({
        uploadUrl: 'https://u.example/put',
        publicUrl: 'https://u.example/pub',
        expires: '2026-01-01T00:00:00.000Z',
      }),
    ).toEqual({
      uploadUrl: 'https://u.example/put',
      publicUrl: 'https://u.example/pub',
      expires: '2026-01-01T00:00:00.000Z',
    });
  });

  it('reads snake_case fields', () => {
    expect(
      normalizePresignResponse({
        upload_url: 'https://u.example/put',
        public_url: 'https://u.example/pub',
      }),
    ).toEqual({
      uploadUrl: 'https://u.example/put',
      publicUrl: 'https://u.example/pub',
    });
  });

  it('returns null when incomplete', () => {
    expect(normalizePresignResponse({ uploadUrl: 'x' })).toBeNull();
    expect(normalizePresignResponse(null)).toBeNull();
  });
});

describe('isLikelyZernioAccessibleMediaUrl', () => {
  it('matches googleapis and zernio hosts', () => {
    expect(
      isLikelyZernioAccessibleMediaUrl(
        'https://storage.googleapis.com/b/o/x.png',
      ),
    ).toBe(true);
    expect(
      isLikelyZernioAccessibleMediaUrl('https://cdn.zernio.com/a/b.jpg'),
    ).toBe(true);
    expect(isLikelyZernioAccessibleMediaUrl('https://evil.com/x.png')).toBe(
      false,
    );
  });
});

describe('leafFileNameFromUrl', () => {
  it('extracts last path segment', () => {
    expect(leafFileNameFromUrl('https://x.com/a/b/c.png')).toBe('c.png');
  });
});

describe('resolvePresignMime', () => {
  it('uses Content-Type when usable', () => {
    expect(resolvePresignMime('image/png; charset=utf-8', 'x.bin')).toBe(
      'image/png',
    );
  });

  it('infers from filename when octet-stream', () => {
    expect(resolvePresignMime('application/octet-stream', 'a.mp4')).toBe(
      'video/mp4',
    );
    expect(resolvePresignMime(null, 'a.webp')).toBe('image/webp');
  });
});

describe('zernioMediaItemTypeFromMime', () => {
  it('classifies video vs image', () => {
    expect(zernioMediaItemTypeFromMime('video/mp4')).toBe('video');
    expect(zernioMediaItemTypeFromMime('image/jpeg')).toBe('image');
  });
});

describe('assertPdfNotUsedForPresign', () => {
  it('throws for application/pdf', () => {
    expect(() => assertPdfNotUsedForPresign('application/pdf')).toThrow(
      /PDF media is not supported/,
    );
  });
});

describe('sniffMimeFromBytes', () => {
  it('detects png', () => {
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    expect(sniffMimeFromBytes(png)).toEqual({ mime: 'image/png', ext: 'png' });
  });

  it('returns null for unknown bytes', () => {
    expect(sniffMimeFromBytes(new Uint8Array([1, 2, 3, 4]))).toBeNull();
  });
});
