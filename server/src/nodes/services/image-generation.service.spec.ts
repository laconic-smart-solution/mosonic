import { ImageGenerationService } from './image-generation.service';
import type { Rule } from '../../rule/schemas/rule.schema';

describe('ImageGenerationService', () => {
  const rule = {
    ruleId: 'r1',
    brand: {
      brandName: 'Mosonic',
      industry: 'SaaS',
      brandTone: ['playful'],
    },
    audience: { description: 'Thai SMEs', location: ['Bangkok'] },
    channels: [
      { channel: 'instagram', priority: 'high', contentStyle: 'visual-first' },
    ],
    contentGuidelines: { donts: [] },
  } as unknown as Rule;

  function makeLlm(promptCapture: { prompt?: string }) {
    return {
      generateImageBase64: jest.fn(({ prompt }: { prompt: string }) => {
        promptCapture.prompt = prompt;
        return { base64: 'abc', mimeType: 'image/png' };
      }),
      uploadImageBase64: jest.fn(() => ({
        fileUrl: 'https://files.example.com/image.png',
      })),
    };
  }

  it('skips classification when an explicit template is configured', async () => {
    const promptCapture: { prompt?: string } = {};
    const llm = makeLlm(promptCapture);
    const classifier = { classify: jest.fn() };

    const svc = new ImageGenerationService(llm as never, classifier as never);

    await svc.generateImage({
      rule,
      workflowRef: 'wf1',
      contentPrompt: '',
      previousOutputs: { text: 'Bubble tea launch this weekend' },
      config: { template: 'product_mockup', channel: 'instagram' },
    });

    expect(classifier.classify).not.toHaveBeenCalled();
    expect(promptCapture.prompt).toContain('clean product shot');
  });

  it('calls the classifier and uses its result when template is auto (default)', async () => {
    const promptCapture: { prompt?: string } = {};
    const llm = makeLlm(promptCapture);
    const classifier = {
      classify: jest.fn(() => 'infographic'),
    };

    const svc = new ImageGenerationService(llm as never, classifier as never);

    await svc.generateImage({
      rule,
      workflowRef: 'wf1',
      contentPrompt: '',
      previousOutputs: { text: 'Q3 growth stats' },
      config: { channel: 'instagram' },
    });

    expect(classifier.classify).toHaveBeenCalledWith(
      expect.objectContaining({
        rule,
        channel: 'instagram',
        contentStyle: 'visual-first',
        text: 'Q3 growth stats',
      }),
    );
    expect(promptCapture.prompt).toContain('infographic layout');
  });
});
