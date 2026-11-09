import {
  blankBrandAskBlock,
  brandHasIntakeSeed,
  brandNameFromWebsiteUrl,
  getBrandReadiness,
  isBlankBrand,
  shouldGateBlankBrand,
} from './blank-brand.util';

describe('isBlankBrand', () => {
  const blank = {
    name: 'Untitled brand',
    brand: { brandName: 'Untitled', brandDescription: '', brandVoice: '', industry: '' },
  };

  it('detects the Welcome "Start a new brand" shell', () => {
    expect(isBlankBrand(blank)).toBe(true);
  });
  it('is not blank once a description exists', () => {
    expect(isBlankBrand({ ...blank, brand: { ...blank.brand, brandDescription: 'Organic tea shop' } })).toBe(false);
  });
  it('is not blank once renamed', () => {
    expect(isBlankBrand({ ...blank, name: 'Beauty Phoo', brand: { ...blank.brand, brandName: 'Beauty Phoo' } })).toBe(false);
  });
  it('is not blank with a visual identity (website extract)', () => {
    expect(isBlankBrand({ ...blank, brand: { ...blank.brand, visualIdentity: { colors: ['#000'] } } })).toBe(false);
  });
  it('null rule is not blank (onboarding covers no-brand)', () => {
    expect(isBlankBrand(null)).toBe(false);
  });
});

describe('getBrandReadiness & shouldGateBlankBrand', () => {
  const blank = {
    name: 'Untitled brand',
    brand: { brandName: 'Untitled', brandDescription: '', brandVoice: '', industry: '' },
  };

  it('evaluates a bare Untitled shell as EMPTY and gates it', () => {
    expect(getBrandReadiness(blank).readiness).toBe('EMPTY');
    expect(shouldGateBlankBrand(blank, [])).toBe(true);
  });

  it('evaluates processing or EXTRACTING status as EXTRACTING and gates it', () => {
    expect(getBrandReadiness({ ...blank, status: 'processing' }).readiness).toBe('EXTRACTING');
    expect(getBrandReadiness({ ...blank, intake: { readiness: 'EXTRACTING' } }).readiness).toBe('EXTRACTING');
    expect(shouldGateBlankBrand({ ...blank, intake: { readiness: 'EXTRACTING' } })).toBe(true);
  });

  it('evaluates failed extraction as FAILED and gates it', () => {
    const res = getBrandReadiness({ ...blank, status: 'failed', intake: { failureReason: 'Connection timed out' } });
    expect(res.readiness).toBe('FAILED');
    expect(res.reason).toBe('Connection timed out');
    expect(shouldGateBlankBrand({ ...blank, status: 'failed' })).toBe(true);
  });

  it('evaluates populated brand as READY and lifts gate', () => {
    const populated = {
      name: 'Beauty Phoo',
      brand: { brandName: 'Beauty Phoo', brandDescription: 'Natural herbal cosmetics' },
    };
    expect(getBrandReadiness(populated).readiness).toBe('READY');
    expect(shouldGateBlankBrand(populated)).toBe(false);
  });
});

describe('brandHasIntakeSeed / brandNameFromWebsiteUrl', () => {
  it('detects logo and reference_image only', () => {
    expect(brandHasIntakeSeed([{ type: 'logo' }])).toBe(true);
    expect(brandHasIntakeSeed([{ type: 'guideline_document' }])).toBe(false);
    expect(brandHasIntakeSeed([])).toBe(false);
  });
  it('derives a display name from the host', () => {
    expect(brandNameFromWebsiteUrl('https://www.beautyphoo.com/')).toBe('Beautyphoo');
    expect(brandNameFromWebsiteUrl('https://brew-co.coffee')).toBe('Brew-co');
  });
});

describe('blankBrandAskBlock', () => {
  it('blocks make_post / intro chips', () => {
    expect(blankBrandAskBlock({ options: [{ id: 'make_post', label: 'Make a post' }, { id: 'x', label: 'Other' }] })).toMatch(/^brand_empty/);
    expect(blankBrandAskBlock({ options: [{ id: 'a', label: 'Introduce the brand' }, { id: 'b', label: 'Later' }] })).toMatch(/^brand_empty/);
  });
  it('blocks start_generation confirms', () => {
    expect(blankBrandAskBlock({ confirmFor: 'start_generation', options: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }] })).toMatch(/^brand_empty/);
  });
  it('allows intake chips', () => {
    expect(blankBrandAskBlock({ options: [{ id: 'paste_website', label: 'Paste my website' }, { id: 'describe_brand', label: 'Describe my brand' }] })).toBeNull();
  });
});