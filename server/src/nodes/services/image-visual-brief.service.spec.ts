import { ImageVisualBriefService } from './image-visual-brief.service';
import type { Rule } from '../../rule/schemas/rule.schema';

describe('ImageVisualBriefService', () => {
  const rule = {
    ruleId: 'r1',
    brand: { brandName: 'Mosonic', industry: 'SaaS', brandTone: ['playful'] },
    campaign: { goals: ['sales'] },
    audience: { description: 'Thai SMEs' },
    channels: [],
  } as unknown as Rule;

  const validBrief = {
    subject: 'a ceramic cup of dark roasted coffee',
    scene: 'a modern Bangkok apartment at sunrise',
    composition: 'close-up, subject on the right third',
    lighting: 'warm morning sunlight from the left',
    colorPalette: 'warm brown, cream, soft gold',
    mood: 'premium, calm',
    props: 'coffee beans, linen cloth',
    avoid: 'plastic-looking coffee',
    textLabels: '',
  };

  it('returns the parsed brief on a valid JSON response', async () => {
    const llm = {
      getChatModelForPlainText: () => ({
        invoke: () => Promise.resolve({ content: JSON.stringify(validBrief) }),
      }),
    };
    const svc = new ImageVisualBriefService(llm as never);

    const out = await svc.generateBrief({
      rule,
      effectiveTemplate: 'lifestyle' as never,
      channel: 'instagram',
      text: 'Discover our premium coffee experience.',
    });

    expect(out).toEqual(validBrief);
  });

  it('returns textLabels when the model extracts real content for an infographic', async () => {
    const infographicBrief = {
      ...validBrief,
      subject: 'a clean process diagram',
      textLabels:
        'Goal: reduce onboarding time by 40%, Step 1: assess current flow, Step 2: identify drop-off points',
    };
    const llm = {
      getChatModelForPlainText: () => ({
        invoke: () =>
          Promise.resolve({ content: JSON.stringify(infographicBrief) }),
      }),
    };
    const svc = new ImageVisualBriefService(llm as never);

    const out = await svc.generateBrief({
      rule,
      effectiveTemplate: 'infographic' as never,
      text: 'Onboarding rubric: assess current flow, identify drop-off points, redesign with scoring.',
    });

    expect(out?.textLabels).toBe(infographicBrief.textLabels);
  });

  it('returns null on unparseable JSON', async () => {
    const llm = {
      getChatModelForPlainText: () => ({
        invoke: () => Promise.resolve({ content: 'not json' }),
      }),
    };
    const svc = new ImageVisualBriefService(llm as never);

    const out = await svc.generateBrief({
      rule,
      effectiveTemplate: 'photorealistic' as never,
      text: 'Some content',
    });

    expect(out).toBeNull();
  });

  it('returns null when subject is missing or empty', async () => {
    const llm = {
      getChatModelForPlainText: () => ({
        invoke: () =>
          Promise.resolve({
            content: JSON.stringify({ ...validBrief, subject: '' }),
          }),
      }),
    };
    const svc = new ImageVisualBriefService(llm as never);

    const out = await svc.generateBrief({
      rule,
      effectiveTemplate: 'photorealistic' as never,
      text: 'Some content',
    });

    expect(out).toBeNull();
  });

  it('returns null when the model call throws', async () => {
    const llm = {
      getChatModelForPlainText: () => ({
        invoke: () => Promise.reject(new Error('provider down')),
      }),
    };
    const svc = new ImageVisualBriefService(llm as never);

    const out = await svc.generateBrief({
      rule,
      effectiveTemplate: 'photorealistic' as never,
      text: 'Some content',
    });

    expect(out).toBeNull();
  });
});
