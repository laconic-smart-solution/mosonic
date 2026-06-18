import {
  adaptChannelHumanReminder,
  adaptChannelPromptGuardrails,
  enforceAdaptChannelLimits,
} from './adapt-channel-guardrails.util';

describe('adapt-channel-guardrails.util', () => {
  it('adds TikTok slideshow title limits to adapt prompts', () => {
    const lines = adaptChannelPromptGuardrails('tiktok');
    expect(lines.join('\n')).toMatch(/90 characters/);
    expect(lines.join('\n')).toMatch(/slideshow title/i);
    expect(adaptChannelPromptGuardrails('instagram')).toEqual([]);
  });

  it('reminds TikTok human prompt of character cap', () => {
    expect(adaptChannelHumanReminder('tiktok')).toMatch(/90 characters/);
    expect(adaptChannelHumanReminder('facebook')).toBeNull();
  });

  it('enforces TikTok adapt output length after generation', () => {
    const long = 'a'.repeat(120);
    const out = enforceAdaptChannelLimits('tiktok', long);
    expect(out.length).toBeLessThanOrEqual(90);
    expect(enforceAdaptChannelLimits('instagram', long)).toBe(long);
  });

  it('collapses newlines for TikTok output', () => {
    const out = enforceAdaptChannelLimits('tiktok', 'Line one\n\nLine two');
    expect(out).toBe('Line one Line two');
  });
});
