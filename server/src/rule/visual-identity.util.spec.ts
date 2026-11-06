import {
  formatVisualIdentityLines,
  normalizeHex,
  normalizeVisualIdentity,
  visualIdentityGuideMarkdown,
} from './visual-identity.util';

describe('normalizeHex', () => {
  it('expands short hex and lowercases', () => {
    expect(normalizeHex('#AbC')).toBe('#aabbcc');
    expect(normalizeHex('#112233')).toBe('#112233');
  });

  it('rejects non-hex', () => {
    expect(normalizeHex('blue')).toBeNull();
    expect(normalizeHex('#12')).toBeNull();
    expect(normalizeHex('')).toBeNull();
  });
});

describe('normalizeVisualIdentity', () => {
  it('keeps evidenced hex and drops invalid', () => {
    const vi = normalizeVisualIdentity({
      primary: '#FF5500',
      secondary: 'orange',
      accent: '#0af',
      designKeywords: ['minimal', ''],
    });
    expect(vi?.primary).toBe('#ff5500');
    expect(vi?.secondary).toBeUndefined();
    expect(vi?.accent).toBe('#00aaff');
    expect(vi?.designKeywords).toEqual(['minimal']);
    expect(vi?.colorsUnknown).toBeUndefined();
  });

  it('marks colorsUnknown when only design prose is present', () => {
    const vi = normalizeVisualIdentity({
      designDirection: 'Clean photography-led homepage with generous whitespace.',
      designKeywords: ['minimal', 'photography'],
    });
    expect(vi?.colorsUnknown).toBe(true);
    expect(vi?.primary).toBeUndefined();
  });

  it('returns undefined for empty objects', () => {
    expect(normalizeVisualIdentity({})).toBeUndefined();
    expect(normalizeVisualIdentity(null)).toBeUndefined();
  });
});

describe('formatVisualIdentityLines', () => {
  it('formats colors and keywords', () => {
    const lines = formatVisualIdentityLines({
      primary: '#112233',
      designKeywords: ['bold'],
    });
    expect(lines.some((l) => l.includes('#112233'))).toBe(true);
    expect(lines.some((l) => l.includes('bold'))).toBe(true);
    expect(visualIdentityGuideMarkdown({ primary: '#112233' })).toContain('# Brand visual identity');
  });
});
