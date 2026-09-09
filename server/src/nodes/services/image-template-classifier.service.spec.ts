// `@toon-format/toon` is ESM-only; Jest's default transform can't parse it.
jest.mock('../../common/utils/toon.util', () => ({
  toPromptToon: (data: unknown) => JSON.stringify(data),
}));

import { ImageTemplateClassifierService } from './image-template-classifier.service';
import type { Rule } from '../../rule/schemas/rule.schema';

describe('ImageTemplateClassifierService', () => {
  const rule = {
    ruleId: 'r1',
    brand: { brandName: 'Mosonic', industry: 'SaaS', brandTone: ['playful'] },
    campaign: { goals: ['sales'] },
    audience: { description: 'Thai SMEs' },
    channels: [],
  } as unknown as Rule;

  function makeTemplateResolver() {
    return {
      listActiveDefinitions: jest.fn().mockResolvedValue([
        { key: 'ad_creative', description: 'has an offer or CTA' },
        { key: 'infographic', description: 'built around concrete data' },
      ]),
    };
  }

  it('returns the classified template on a valid JSON response', async () => {
    const llm = {
      getChatModelForPlainText: () => ({
        invoke: () =>
          Promise.resolve({
            content: JSON.stringify({ template: 'infographic' }),
          }),
      }),
    };
    const svc = new ImageTemplateClassifierService(
      llm as never,
      makeTemplateResolver() as never,
    );

    const out = await svc.classify({
      rule,
      channel: 'linkedin',
      text: 'Q3 growth stats',
    });

    expect(out).toBe('infographic');
  });

  it('includes DB-sourced template definitions in the prompt', async () => {
    let capturedPrompt = '';
    const llm = {
      getChatModelForPlainText: () => ({
        invoke: (messages: [string, string][]) => {
          capturedPrompt = messages[1][1];
          return Promise.resolve({
            content: JSON.stringify({ template: 'ad_creative' }),
          });
        },
      }),
    };
    const templateResolver = makeTemplateResolver();
    const svc = new ImageTemplateClassifierService(
      llm as never,
      templateResolver as never,
    );

    await svc.classify({ rule, text: 'Subscribe and get 1 month free' });

    expect(templateResolver.listActiveDefinitions).toHaveBeenCalled();
    expect(capturedPrompt).toContain('has an offer or CTA');
  });

  it('includes the user prompt as the strongest signal when present', async () => {
    let capturedPrompt = '';
    const llm = {
      getChatModelForPlainText: () => ({
        invoke: (messages: [string, string][]) => {
          capturedPrompt = messages[1][1];
          return Promise.resolve({
            content: JSON.stringify({ template: 'ad_creative' }),
          });
        },
      }),
    };
    const svc = new ImageTemplateClassifierService(
      llm as never,
      makeTemplateResolver() as never,
    );

    await svc.classify({
      rule,
      text: 'Crabonic helps teams move forward with modern web solutions.',
      userPrompt: 'Make a promotional banner for our launch discount',
    });

    expect(capturedPrompt).toContain(
      'Make a promotional banner for our launch discount',
    );
    expect(capturedPrompt).toContain('strongest signal');
  });

  it('omits the user-prompt line when no user prompt was given', async () => {
    let capturedPrompt = '';
    const llm = {
      getChatModelForPlainText: () => ({
        invoke: (messages: [string, string][]) => {
          capturedPrompt = messages[1][1];
          return Promise.resolve({
            content: JSON.stringify({ template: 'ad_creative' }),
          });
        },
      }),
    };
    const svc = new ImageTemplateClassifierService(
      llm as never,
      makeTemplateResolver() as never,
    );

    await svc.classify({ rule, text: 'Some content' });

    expect(capturedPrompt).not.toContain('strongest signal');
  });

  it('falls back to photorealistic on unparseable JSON', async () => {
    const llm = {
      getChatModelForPlainText: () => ({
        invoke: () => Promise.resolve({ content: 'not json' }),
      }),
    };
    const svc = new ImageTemplateClassifierService(
      llm as never,
      makeTemplateResolver() as never,
    );

    const out = await svc.classify({ rule, text: 'Some content' });

    expect(out).toBe('photorealistic');
  });

  it('falls back to photorealistic when the returned value is outside the allowed set', async () => {
    const llm = {
      getChatModelForPlainText: () => ({
        invoke: () =>
          Promise.resolve({
            content: JSON.stringify({ template: 'auto' }),
          }),
      }),
    };
    const svc = new ImageTemplateClassifierService(
      llm as never,
      makeTemplateResolver() as never,
    );

    const out = await svc.classify({ rule, text: 'Some content' });

    expect(out).toBe('photorealistic');
  });

  it('falls back to photorealistic when the model call throws', async () => {
    const llm = {
      getChatModelForPlainText: () => ({
        invoke: () => Promise.reject(new Error('provider down')),
      }),
    };
    const svc = new ImageTemplateClassifierService(
      llm as never,
      makeTemplateResolver() as never,
    );

    const out = await svc.classify({ rule, text: 'Some content' });

    expect(out).toBe('photorealistic');
  });
});
