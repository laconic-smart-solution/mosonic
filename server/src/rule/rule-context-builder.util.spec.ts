import { buildOnboardingPrompt, buildRuleBrainPrompt } from './rule-context-builder.util';
import type { RuleRecord } from '../repositories/interfaces/rule.repository.interface';
import type { RuleAssetRecord } from '../repositories/interfaces/rule-asset.repository.interface';

function makeRule(overrides: Partial<RuleRecord> = {}): RuleRecord {
  return {
    ruleId: 'rule-1',
    userId: 'user-1',
    name: 'Acme Co',
    brand: {},
    audience: {},
    campaign: {},
    channels: [],
    contentGuidelines: {},
    originalInput: {},
    intake: null,
    status: 'active',
    versions: [],
    approvalPolicy: [],
    autonomyPolicy: null,
    newsTrigger: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeAsset(overrides: Partial<RuleAssetRecord> = {}): RuleAssetRecord {
  return {
    ruleAssetId: 'asset-1',
    ruleId: 'rule-1',
    userId: 'user-1',
    type: 'logo',
    status: 'ready',
    fileUrl: 'https://files.example.com/logo.png',
    originalFileName: 'logo.png',
    mimeType: 'image/png',
    fileSize: 1024,
    aiDescription: null,
    extractedText: null,
    ragEnabled: false,
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('buildRuleBrainPrompt', () => {
  it('always includes the rule name header', () => {
    const prompt = buildRuleBrainPrompt(makeRule());
    expect(prompt).toContain('Acme Co');
  });

  it('includes structured brand/audience/campaign fields when present', () => {
    const prompt = buildRuleBrainPrompt(
      makeRule({
        brand: { brandTone: 'playful', industry: 'retail' },
        audience: { description: 'young professionals' },
        campaign: { goals: ['awareness', 'engagement'] },
        channels: ['instagram', 'line'],
      }),
    );
    expect(prompt).toContain('playful');
    expect(prompt).toContain('retail');
    expect(prompt).toContain('young professionals');
    expect(prompt).toContain('awareness, engagement');
    expect(prompt).toContain('instagram, line');
  });

  it('omits empty sections rather than printing blank headers', () => {
    const prompt = buildRuleBrainPrompt(makeRule());
    expect(prompt).not.toContain('## Brand');
    expect(prompt).not.toContain('## Audience');
    expect(prompt).not.toContain('## Campaign');
  });

  it('only includes assets with status ready', () => {
    const prompt = buildRuleBrainPrompt(makeRule(), [
      makeAsset({ status: 'ready', aiDescription: 'A blue circular logo' }),
      makeAsset({
        ruleAssetId: 'asset-2',
        status: 'processing',
        aiDescription: null,
      }),
    ]);
    expect(prompt).toContain('A blue circular logo');
    expect(prompt).not.toContain('asset-2');
  });

  it('falls back to extractedText when aiDescription is missing', () => {
    const prompt = buildRuleBrainPrompt(makeRule(), [
      makeAsset({
        type: 'guideline_document',
        originalFileName: 'brand-guide.pdf',
        extractedText: 'Our brand voice is warm and direct.',
      }),
    ]);
    expect(prompt).toContain('brand-guide.pdf');
    expect(prompt).toContain('Our brand voice is warm and direct.');
  });

  it('omits the memory section when there are no memories', () => {
    const prompt = buildRuleBrainPrompt(makeRule());
    expect(prompt).not.toContain('## Brand memory');
  });

  it('includes memories with their type and id', () => {
    const prompt = buildRuleBrainPrompt(makeRule(), [], [
      {
        ruleMemoryId: 'mem-1',
        ruleId: 'rule-1',
        userId: 'user-1',
        type: 'correction',
        body: 'Never suggest infographics for LinkedIn.',
        embedding: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    expect(prompt).toContain('## Brand memory');
    expect(prompt).toContain('[correction, id=mem-1] Never suggest infographics for LinkedIn.');
  });
});

describe('buildOnboardingPrompt', () => {
  it('creates the brand on a defer instead of re-asking', () => {
    const p = buildOnboardingPrompt();
    expect(p).toMatch(/you decide/);
    expect(p).toMatch(/never re-ask/);
    expect(p).toMatch(/ask at most for channels/);
  });
});
