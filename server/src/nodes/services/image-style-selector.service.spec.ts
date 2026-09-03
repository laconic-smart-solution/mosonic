// `@toon-format/toon` is ESM-only; Jest's default transform can't parse it.
jest.mock('../../common/utils/toon.util', () => ({
  toPromptToon: (data: unknown) => JSON.stringify(data),
}));

import { ImageStyleSelectorService } from './image-style-selector.service';
import type { Rule } from '../../rule/schemas/rule.schema';

describe('ImageStyleSelectorService', () => {
  const rule = {
    ruleId: 'r1',
    brand: { brandName: 'Mosonic', industry: 'SaaS', brandTone: ['playful'] },
  } as unknown as Rule;

  const styles = [
    { key: 'minimalism', name: 'Minimalism', description: 'd1', prompt: 'p1' },
    { key: 'cyberpunk', name: 'Cyberpunk', description: 'd2', prompt: 'p2' },
  ];

  function makeStyleRepo(list = styles) {
    return { listActive: jest.fn().mockResolvedValue(list) };
  }

  it('returns the classified style key when valid', async () => {
    const llm = {
      getChatModelForPlainText: () => ({
        invoke: () =>
          Promise.resolve({ content: JSON.stringify({ style: 'cyberpunk' }) }),
      }),
    };
    const svc = new ImageStyleSelectorService(
      llm as never,
      makeStyleRepo() as never,
    );

    const out = await svc.select({
      rule,
      userPrompt: 'futuristic security operation center',
      templateName: 'Product Advertisement',
    });

    expect(out).toBe('cyberpunk');
  });

  it('falls back to minimalism when the response is unparseable', async () => {
    const llm = {
      getChatModelForPlainText: () => ({
        invoke: () => Promise.resolve({ content: 'not json' }),
      }),
    };
    const svc = new ImageStyleSelectorService(
      llm as never,
      makeStyleRepo() as never,
    );

    const out = await svc.select({ rule, userPrompt: '', templateName: 'x' });

    expect(out).toBe('minimalism');
  });

  it('falls back to minimalism when the returned key is not in the active list', async () => {
    const llm = {
      getChatModelForPlainText: () => ({
        invoke: () =>
          Promise.resolve({ content: JSON.stringify({ style: 'victorian' }) }),
      }),
    };
    const svc = new ImageStyleSelectorService(
      llm as never,
      makeStyleRepo() as never,
    );

    const out = await svc.select({ rule, userPrompt: '', templateName: 'x' });

    expect(out).toBe('minimalism');
  });

  it('falls back to the first active style when minimalism is not in the list', async () => {
    const llm = {
      getChatModelForPlainText: () => ({
        invoke: () => Promise.resolve({ content: 'not json' }),
      }),
    };
    const styleRepo = makeStyleRepo([
      { key: 'cyberpunk', name: 'Cyberpunk', description: 'd2', prompt: 'p2' },
    ]);
    const svc = new ImageStyleSelectorService(llm as never, styleRepo as never);

    const out = await svc.select({ rule, userPrompt: '', templateName: 'x' });

    expect(out).toBe('cyberpunk');
  });

  it('falls back to minimalism when the model call throws', async () => {
    const llm = {
      getChatModelForPlainText: () => ({
        invoke: () => Promise.reject(new Error('provider down')),
      }),
    };
    const svc = new ImageStyleSelectorService(
      llm as never,
      makeStyleRepo() as never,
    );

    const out = await svc.select({ rule, userPrompt: '', templateName: 'x' });

    expect(out).toBe('minimalism');
  });
});
