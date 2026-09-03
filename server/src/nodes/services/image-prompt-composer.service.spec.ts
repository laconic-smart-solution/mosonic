import { ImagePromptComposerService } from './image-prompt-composer.service';
import { NodeImageTemplate } from '../schemas/workflow-node.schema';
import type { Rule } from '../../rule/schemas/rule.schema';

describe('ImagePromptComposerService', () => {
  const rule = {
    ruleId: 'r1',
    brand: { brandName: 'Mosonic', industry: 'SaaS', brandTone: ['playful'] },
  } as unknown as Rule;

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

    const out = await svc.compose({
      rule,
      userPrompt: 'coffee ad',
      designDirection: 'a merged composition and style direction',
      marketingText: 'Discover our premium coffee.',
      effectiveTemplate: NodeImageTemplate.AdCreative,
    });

    expect(out).toBe('A close-up of a ceramic coffee cup at sunrise.');
  });

  it('includes the design direction in the prompt sent to the model', async () => {
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
      rule,
      userPrompt: '',
      designDirection: 'dense urban neon environment with sharp geometric panels',
      marketingText: 'Discover our premium coffee.',
      effectiveTemplate: NodeImageTemplate.AdCreative,
    });

    expect(capturedPrompt).toContain(
      'dense urban neon environment with sharp geometric panels',
    );
  });

  it('uses the verbatim-text instruction for infographic templates', async () => {
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
      rule,
      userPrompt: '',
      designDirection: 'template prompt text',
      marketingText: 'Step 1: assess. Step 2: redesign.',
      effectiveTemplate: NodeImageTemplate.Infographic,
    });

    expect(capturedPrompt).toContain('use only exact labels');
    expect(capturedPrompt).not.toContain('Do not include any text');
  });

  it('returns null when the response is empty', async () => {
    const llm = {
      getChatModelForPlainText: () => ({
        invoke: () => Promise.resolve({ content: '   ' }),
      }),
    };
    const svc = new ImagePromptComposerService(llm as never);

    const out = await svc.compose({
      rule,
      userPrompt: '',
      designDirection: 'x',
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
      rule,
      userPrompt: '',
      designDirection: 'x',
      marketingText: 'x',
      effectiveTemplate: NodeImageTemplate.Photorealistic,
    });

    expect(out).toBeNull();
  });
});
