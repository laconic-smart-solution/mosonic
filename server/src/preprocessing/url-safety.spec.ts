import {
  extractUrlsFromText,
  mergeUrlSources,
  normalizeHttpUrl,
  tryNormalizeHttpUrl,
} from './url-safety';

describe('normalizeHttpUrl', () => {
  it('adds https when scheme is missing', () => {
    expect(normalizeHttpUrl('zenichub.com/en')).toBe('https://zenichub.com/en');
  });

  it('keeps existing scheme', () => {
    expect(normalizeHttpUrl('https://www.adidas.co.th/th')).toBe(
      'https://www.adidas.co.th/th',
    );
  });
});

describe('tryNormalizeHttpUrl', () => {
  it('rejects empty and non-http schemes', () => {
    expect(tryNormalizeHttpUrl('')).toBeNull();
    expect(tryNormalizeHttpUrl('ftp://example.com')).toBeNull();
  });
});

describe('extractUrlsFromText', () => {
  it('finds full and bare URLs', () => {
    const text =
      'See https://zenichub.com/en and www.adidas.co.th/th for brands.';
    expect(extractUrlsFromText(text)).toEqual([
      'https://zenichub.com/en',
      'https://www.adidas.co.th/th',
    ]);
  });

  it('strips trailing punctuation', () => {
    expect(extractUrlsFromText('Visit https://example.com/path.')).toEqual([
      'https://example.com/path',
    ]);
  });
});

describe('mergeUrlSources', () => {
  it('dedupes attachment and text URLs', () => {
    expect(
      mergeUrlSources('https://zenichub.com/en', [
        'zenichub.com/en',
        'https://www.adidas.co.th/th',
      ]),
    ).toEqual(['https://zenichub.com/en', 'https://www.adidas.co.th/th']);
  });
});
