import { buildCapabilitySummary, normalizeLanguage, parseRequest, parseTargetLanguages, preflightRequest } from './capability.util';

describe('preflightRequest', () => {
  const text = { nodeId: 't', type: 'text_generation' };
  const image = { nodeId: 'i', type: 'image_generation' };

  it('a no-lane workflow: the shared Image step covers every channel (P06)', () => {
    const plan = preflightRequest({ request: parseRequest('instagram photo post'), nodes: [text, image], attachedImages: 1 });
    expect(plan.willChange).toEqual([]);
  });

  it('a no-lane workflow without an Image step still needs one', () => {
    const plan = preflightRequest({ request: parseRequest('instagram photo post'), nodes: [text], attachedImages: 0 });
    expect(plan.willChange).toEqual(['Add an image step (add_workflow_node image_generation)']);
  });

  it('a lane with no image is still flagged', () => {
    const nodes = [text, { nodeId: 'a', type: 'adapt', lane: 'instagram' }, { nodeId: 'b', type: 'adapt', lane: 'facebook' }, { nodeId: 'i', type: 'image_generation', lane: 'facebook' }];
    const plan = preflightRequest({ request: parseRequest('instagram photo post'), nodes, attachedImages: 0 });
    expect(plan.willChange.join(' ')).toMatch(/image step for Instagram/);
  });
});

describe('translation capability (B)', () => {
  const textNode = { type: 'text_generation', lane: null, config: {} };
  it('parses requested languages only next to a cue', () => {
    expect(parseTargetLanguages('make a post in Thai')).toEqual(['th']);
    expect(parseTargetLanguages('Thai and English versions please')).toEqual(['th', 'en']);
    expect(parseTargetLanguages('translate it into Japanese')).toEqual(['ja']);
    expect(parseTargetLanguages('a post about Thai food')).toEqual([]);
    expect(parseRequest('promo post, also in Chinese').targetLanguages).toEqual(['zh']);
  });
  it('normalizes language names and codes', () => {
    expect(normalizeLanguage('English')).toBe('en');
    expect(normalizeLanguage('th-TH')).toBe('th');
    expect(normalizeLanguage('')).toBeNull();
  });
  it('preflight flags a missing translation step, skipping the base language', () => {
    const plan = preflightRequest({ request: parseRequest('post in Thai and English'), nodes: [textNode], attachedImages: 0, baseLanguage: 'en' });
    expect(plan.missingLanguages).toEqual(['th']);
    expect(plan.willChange.join(' ')).toMatch(/translation step for th/);
  });
  it('preflight is clean when a translation node covers the language', () => {
    const nodes = [textNode, { type: 'translation', lane: null, config: { targetLanguage: 'th' } }];
    const plan = preflightRequest({ request: parseRequest('post in Thai'), nodes, attachedImages: 0 });
    expect(plan.missingLanguages).toEqual([]);
    expect(plan.willChange).toEqual([]);
  });
  it('preflight counts languages passed as an argument', () => {
    const plan = preflightRequest({ request: parseRequest('a sale post'), nodes: [textNode], attachedImages: 0, languages: ['ja'] });
    expect(plan.missingLanguages).toEqual(['ja']);
  });
  it('capability summary names the translation setup', () => {
    const out = buildCapabilitySummary({ brandName: 'B', brandChannels: [], nodes: [textNode, { type: 'translation', config: { targetLanguage: 'zh' } }], activeRun: false, latestDraft: null, styleNote: null, readyReferenceImages: 0, attachedImages: 0, baseLanguage: 'en' });
    expect(out).toMatch(/translates to zh/);
    expect(out).toMatch(/Other languages/);
  });
});
