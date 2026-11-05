import type { Rule } from '../../rule/schemas/rule.schema';
import {
  buildVideoPrompt,
  normalizeCinematicDurationSeconds,
  normalizeVideoConfig,
  VIDEO_OUTPUT_GUARDRAILS,
} from './video-generation.service';

describe('VideoGenerationService helpers', () => {
  it('normalizeCinematicDurationSeconds picks nearest allowed duration', () => {
    expect(normalizeCinematicDurationSeconds(7)).toBe(5);
    expect(normalizeCinematicDurationSeconds(11)).toBe(10);
    expect(normalizeCinematicDurationSeconds(14)).toBe(15);
  });

  it('normalizeCinematicDurationSeconds keeps 5/10/15 and defaults to 10', () => {
    expect(normalizeCinematicDurationSeconds(5)).toBe(5);
    expect(normalizeCinematicDurationSeconds(10)).toBe(10);
    expect(normalizeCinematicDurationSeconds(15)).toBe(15);
    expect(normalizeCinematicDurationSeconds(60)).toBe(15);
    expect(normalizeCinematicDurationSeconds(undefined)).toBe(10);
    expect(normalizeCinematicDurationSeconds('abc')).toBe(10);
  });

  it('normalizeVideoConfig parses string duration and keeps HeyGen models only', () => {
    expect(normalizeVideoConfig({ duration: '15' } as never).duration).toBe(15);
    expect(normalizeVideoConfig({ model: 'seedance_2' }).model).toBe('seedance_2');
    expect(normalizeVideoConfig({ model: 'sora-2' }).model).toBe('heygen_video_1');
    const cfg = normalizeVideoConfig({ aspectRatio: '9:16', resolution: '1080p' } as never);
    expect(cfg.aspectRatio).toBe('9:16');
    expect(cfg.resolution).toBe('1080p');
    expect(cfg).not.toHaveProperty('secondsForApi');
    expect(cfg).not.toHaveProperty('sizeForApi');
  });

  it('normalizeVideoConfig defaults model and aspect ratio', () => {
    const cfg = normalizeVideoConfig({});
    expect(cfg.model).toBe('heygen_video_1');
    expect(cfg.aspectRatio).toBe('16:9');
    expect(cfg.duration).toBe(10);
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
