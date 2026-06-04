import type { Rule } from '../../rule/schemas/rule.schema';
import {
  buildVideoPrompt,
  mapOpenAiVideoStatus,
  normalizeSoraDurationSeconds,
  normalizeVideoConfig,
  VIDEO_OUTPUT_GUARDRAILS,
} from './video-generation.service';

describe('VideoGenerationService helpers', () => {
  it('normalizeSoraDurationSeconds picks nearest allowed duration', () => {
    expect(normalizeSoraDurationSeconds(7)).toBe(8);
    expect(normalizeSoraDurationSeconds(11)).toBe(12);
  });

  it('normalizeVideoConfig defaults model and aspect ratio', () => {
    const cfg = normalizeVideoConfig({});
    expect(cfg.model).toBe('sora-2');
    expect(cfg.aspectRatio).toBe('16:9');
    expect(cfg.duration).toBe(8);
  });

  it('mapOpenAiVideoStatus maps terminal states', () => {
    expect(mapOpenAiVideoStatus('completed')).toBe('completed');
    expect(mapOpenAiVideoStatus('failed')).toBe('failed');
    expect(mapOpenAiVideoStatus('in_progress')).toBe('processing');
    expect(mapOpenAiVideoStatus('queued')).toBe('processing');
  });

  it('buildVideoPrompt includes mandatory output guardrails', () => {
    const rule = {
      brand: {
        brandName: 'Acme',
        industry: 'Retail',
        brandDescription: 'Test brand',
        brandTone: ['friendly'],
      },
      audience: { description: 'Shoppers', location: ['US'] },
      channels: [{ channel: 'instagram' }],
      contentGuidelines: { donts: [], requiredElements: [] },
    } as unknown as Rule;
    const prompt = buildVideoPrompt(
      rule,
      { text: 'Summer sale highlights' },
      normalizeVideoConfig({}),
    );
    expect(prompt).toContain('VIDEO OUTPUT CONSTRAINTS');
    for (const line of VIDEO_OUTPUT_GUARDRAILS) {
      expect(prompt).toContain(line);
    }
    expect(prompt).toContain('No phone numbers');
    expect(prompt).toContain('No logos');
  });

  it('buildVideoPrompt appends node negativePrompt when set', () => {
    const rule = {
      brand: {
        brandName: 'Acme',
        industry: 'Retail',
        brandDescription: 'Test',
        brandTone: ['calm'],
      },
      audience: { description: 'All', location: ['TH'] },
      channels: [],
      contentGuidelines: { donts: [], requiredElements: [] },
    } as unknown as Rule;
    const prompt = buildVideoPrompt(
      rule,
      { text: 'Product demo' },
      normalizeVideoConfig({ negativePrompt: 'crowded scenes' }),
    );
    expect(prompt).toContain('Additionally avoid: crowded scenes');
  });
});
