import { blankBrandAskBlock, isBlankBrand } from './blank-brand.util';

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