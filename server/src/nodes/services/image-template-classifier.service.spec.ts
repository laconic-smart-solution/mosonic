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

  it('returns the classified template on a valid JSON response', async () => {
    const llm = {
      getChatModelForPlainText: () => ({
        invoke: () =>
          Promise.resolve({
            content: JSON.stringify({ template: 'infographic' }),
          }),
      }),
    };
    const svc = new ImageTemplateClassifierService(llm as never);

    const out = await svc.classify({
      rule,
      channel: 'linkedin',
      text: 'Q3 growth stats',
    });

    expect(out).toBe('infographic');
  });

  it('falls back to photorealistic on unparseable JSON', async () => {
    const llm = {
      getChatModelForPlainText: () => ({
        invoke: () => Promise.resolve({ content: 'not json' }),
      }),
    };
    const svc = new ImageTemplateClassifierService(llm as never);

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
    const svc = new ImageTemplateClassifierService(llm as never);

    const out = await svc.classify({ rule, text: 'Some content' });

    expect(out).toBe('photorealistic');
  });

  it('falls back to photorealistic when the model call throws', async () => {
    const llm = {
      getChatModelForPlainText: () => ({
        invoke: () => Promise.reject(new Error('provider down')),
      }),
    };
    const svc = new ImageTemplateClassifierService(llm as never);

    const out = await svc.classify({ rule, text: 'Some content' });

    expect(out).toBe('photorealistic');
  });
});
