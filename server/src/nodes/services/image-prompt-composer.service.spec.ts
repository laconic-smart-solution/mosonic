import { ImagePromptComposerService } from './image-prompt-composer.service';
import { NodeImageTemplate } from '../schemas/workflow-node.schema';
import type { Rule } from '../../rule/schemas/rule.schema';

describe('ImagePromptComposerService', () => {
  const rule = {
    ruleId: 'r1',
    brand: {
      brandName: 'Mosonic',
      industry: 'SaaS',
      brandDescription: 'AI content orchestration for Thai SMEs',
      brandTone: ['playful'],
      brandVoice: 'Friendly but professional',
      callToAction: 'Start creating',
      brandRestrictions: ['never mention competitors'],
      visualIdentity: {
        primary: '#1b4f72',
        secondary: '#f5cba7',
        designKeywords: ['minimal', 'photography'],
      },
    },
    audience: {
      description: 'Thai SME owners aged 30-50',
      ageRange: { min: 30, max: 50 },
      location: ['Thailand'],
      interests: ['digital marketing'],
      painPoints: ['too much manual work'],
    },
    campaign: {
      goals: ['brand awareness'],
      keywords: ['AI content'],
    },
  } as unknown as Rule;

  const baseInput = {
    rule,
    userPrompt: 'coffee ad',
    templateName: 'Product Advertisement',
    templatePrompt: 'one dominant focal subject, fill the frame',
    styleName: 'Minimalism',
    stylePrompt: 'restrained palette, generous space',
    marketingText: 'Discover our premium coffee.',
    effectiveTemplate: NodeImageTemplate.AdCreative,
  };

  it('returns the trimmed prose response on success', async () => {
    const llm = {
      getChatModelForPlainText: () => ({
        invoke: () =>
          Promise.resolve({
            content: '  A close-up of a ceramic coffee cup at sunrise.  ',
          }),
      }),
    };
    const svc = new ImagePromptComposerService(llm as never);

    const out = await svc.compose(baseInput);

    expect(out).toBe('A close-up of a ceramic coffee cup at sunrise.');
  });

  it('sends brand, audience, template, and style as labeled inputs', async () => {
    let capturedPrompt = '';
    const llm = {
      getChatModelForPlainText: () => ({
        invoke: (messages: [string, string][]) => {
          capturedPrompt = messages[1][1];
          return Promise.resolve({ content: 'a scene' });
        },
      }),
    };
    const svc = new ImagePromptComposerService(llm as never);

    await svc.compose({
      ...baseInput,
      userPrompt: '',
    });

    expect(capturedPrompt).toContain('Mosonic');
    expect(capturedPrompt).toContain('AI content orchestration for Thai SMEs');
    expect(capturedPrompt).toContain('Thai SME owners aged 30-50');
    expect(capturedPrompt).toContain('Thailand');
    expect(capturedPrompt).toContain('Start creating');
    expect(capturedPrompt).toContain('#1b4f72');
    expect(capturedPrompt).toContain('Visual identity');
    expect(capturedPrompt).toContain('minimal');
    expect(capturedPrompt).toContain(
      'Composition notes (apply to THIS brand\'s subject; do not drop the subject): one dominant focal subject, fill the frame',
    );
    expect(capturedPrompt).toContain('Visual style (Minimalism)');
    expect(capturedPrompt).toContain('restrained palette, generous space');
    expect(capturedPrompt).toContain('Brand identity, target audience, and content accuracy');
    expect(capturedPrompt).toContain('Use:');
    expect(capturedPrompt).toContain('Must include:');
    expect(capturedPrompt).not.toContain('80-130 words');
  });

  it('uses in-image text instructions for infographic templates', async () => {
    let capturedPrompt = '';
    const llm = {
      getChatModelForPlainText: () => ({
        invoke: (messages: [string, string][]) => {
          capturedPrompt = messages[1][1];
          return Promise.resolve({ content: 'an infographic layout' });
        },
      }),
    };
    const svc = new ImagePromptComposerService(llm as never);

    await svc.compose({
      ...baseInput,
      userPrompt: '',
      templateName: 'Infographic',
      templatePrompt: 'clear structured layout',
      marketingText: 'Step 1: assess. Step 2: redesign.',
      effectiveTemplate: NodeImageTemplate.Infographic,
    });

    expect(capturedPrompt).toContain('put exact labels, numbers, and steps');
    expect(capturedPrompt).not.toContain(
      'Do not include captions, headlines, watermarks, or unrelated UI',
    );
  });

  it('asks ad creatives to fill the frame and quote a CTA', async () => {
    let capturedPrompt = '';
    const llm = {
      getChatModelForPlainText: () => ({
        invoke: (messages: [string, string][]) => {
          capturedPrompt = messages[1][1];
          return Promise.resolve({ content: 'an ad' });
        },
      }),
    };
    const svc = new ImagePromptComposerService(llm as never);

    await svc.compose(baseInput);

    expect(capturedPrompt).toContain('finished advertising creative');
    expect(capturedPrompt).toContain('Do not reserve a blank third');
    expect(capturedPrompt).toContain('Text in image');
  });

  it('returns null when the response is empty', async () => {
    const llm = {
      getChatModelForPlainText: () => ({
        invoke: () => Promise.resolve({ content: '   ' }),
      }),
    };
    const svc = new ImagePromptComposerService(llm as never);

    const out = await svc.compose({
      ...baseInput,
      userPrompt: '',
      marketingText: 'x',
      effectiveTemplate: NodeImageTemplate.Photorealistic,
    });

    expect(out).toBeNull();
  });

  it('returns null when the model call throws', async () => {
    const llm = {
      getChatModelForPlainText: () => ({
        invoke: () => Promise.reject(new Error('provider down')),
      }),
    };
    const svc = new ImagePromptComposerService(llm as never);

    const out = await svc.compose({
      ...baseInput,
      userPrompt: '',
      marketingText: 'x',
      effectiveTemplate: NodeImageTemplate.Photorealistic,
    });

    expect(out).toBeNull();
  });
});
