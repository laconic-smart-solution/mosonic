import { mergeResolvedOutputs } from './content-output.utils';

describe('mergeResolvedOutputs', () => {
  it('prefers user edits over AI outputs when user value is set', () => {
    const merged = mergeResolvedOutputs({
      outputs: { keywords: 'kw1', text: 'from-ai', image: 'img-ai' },
      userEdits: { text: 'from-user' },
    });
    expect(merged.keywords).toBe('kw1');
    expect(merged.text).toBe('from-user');
    expect(merged.image).toBe('img-ai');
  });

  it('falls back to AI output when user edit is absent', () => {
    const merged = mergeResolvedOutputs({
      outputs: { summary: 'ai-summary' },
      userEdits: {},
    });
    expect(merged.summary).toBe('ai-summary');
  });

  it('allows empty string user edit to override', () => {
    const merged = mergeResolvedOutputs({
      outputs: { text: 'ai' },
      userEdits: { text: '' },
    });
    expect(merged.text).toBe('');
  });
});
