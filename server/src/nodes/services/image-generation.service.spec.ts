// `@toon-format/toon` is ESM-only; Jest's default transform can't parse it.
jest.mock('../../common/utils/toon.util', () => ({
  toPromptToon: (data: unknown) => JSON.stringify(data),
}));

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

  function makeTemplateResolver(
    row = {
      name: 'Product Advertisement',
      description: 'd',
      prompt: 'template prompt text',
    },
  ) {
    return { resolve: jest.fn().mockResolvedValue(row) };
  }

  function makeStyleSelector(key = 'minimalism') {
    return { select: jest.fn().mockResolvedValue(key) };
  }

  function makeStyleRepository(
    row: {
      key: string;
      name: string;
      description: string;
      prompt: string;
    } | null = {
      key: 'minimalism',
      name: 'Minimalism',
      description: 'd',
      prompt: 'style prompt text',
    },
  ) {
    return { getByKey: jest.fn().mockResolvedValue(row) };
  }

  function makeDesignDirection(
    result: string = 'a merged composition and style direction',
  ) {
    return { compose: jest.fn().mockResolvedValue(result) };
  }

  function makePromptComposer(
    result: string | null = 'A composed natural-language prompt.',
  ) {
    return { compose: jest.fn().mockResolvedValue(result) };
  }

  function makeService(overrides: {
    llm?: ReturnType<typeof makeLlm>;
    classifier?: unknown;
    templateResolver?: ReturnType<typeof makeTemplateResolver>;
    styleSelector?: ReturnType<typeof makeStyleSelector>;
    styleRepository?: ReturnType<typeof makeStyleRepository>;
    designDirection?: ReturnType<typeof makeDesignDirection>;
    promptComposer?: ReturnType<typeof makePromptComposer>;
  }) {
    const promptCapture: { prompt?: string } = {};
    const llm = overrides.llm ?? makeLlm(promptCapture);
    const classifier = overrides.classifier ?? { classify: jest.fn() };
    const templateResolver =
      overrides.templateResolver ?? makeTemplateResolver();
    const styleSelector = overrides.styleSelector ?? makeStyleSelector();
    const styleRepository = overrides.styleRepository ?? makeStyleRepository();
    const designDirection = overrides.designDirection ?? makeDesignDirection();
    const promptComposer = overrides.promptComposer ?? makePromptComposer();

    const svc = new ImageGenerationService(
      llm as never,
      classifier as never,
      templateResolver as never,
      styleSelector as never,
      styleRepository as never,
      designDirection as never,
      promptComposer as never,
    );

    return {
      svc,
      promptCapture,
      classifier,
      templateResolver,
      styleSelector,
      styleRepository,
      designDirection,
      promptComposer,
    };
  }

  it('skips classification when an explicit template is configured', async () => {
    const classifier = { classify: jest.fn() };
    const { svc } = makeService({ classifier });

    await svc.generateImage({
      rule,
      workflowRef: 'wf1',
      contentPrompt: 'a coffee ad',
      previousOutputs: { text: 'Bubble tea launch this weekend' },
      config: { template: 'product_mockup', channel: 'instagram' },
    });

    expect(classifier.classify).not.toHaveBeenCalled();
  });

  it('calls the classifier when template is auto (default)', async () => {
    const classifier = { classify: jest.fn().mockResolvedValue('infographic') };
    const { svc, templateResolver } = makeService({ classifier });

    await svc.generateImage({
      rule,
      workflowRef: 'wf1',
      contentPrompt: 'Make this a promotional banner for our sale',
      previousOutputs: { text: 'Q3 growth stats' },
      config: { channel: 'instagram' },
    });

    expect(classifier.classify).toHaveBeenCalledWith(
      expect.objectContaining({
        rule,
        channel: 'instagram',
        contentStyle: 'visual-first',
        text: 'Q3 growth stats',
        userPrompt: 'Make this a promotional banner for our sale',
      }),
    );
    expect(templateResolver.resolve).toHaveBeenCalledWith('infographic');
  });

  it('passes the original user prompt (not the marketing copy) to the style selector and composer', async () => {
    const { svc, styleSelector, promptComposer } = makeService({});

    await svc.generateImage({
      rule,
      workflowRef: 'wf1',
      contentPrompt: 'show a runner in Bangkok at sunrise',
      previousOutputs: { text: 'Generated marketing copy text' },
      config: { template: 'lifestyle', channel: 'instagram' },
    });

    expect(styleSelector.select).toHaveBeenCalledWith(
      expect.objectContaining({
        userPrompt: 'show a runner in Bangkok at sunrise',
      }),
    );
    expect(promptComposer.compose).toHaveBeenCalledWith(
      expect.objectContaining({
        userPrompt: 'show a runner in Bangkok at sunrise',
        marketingText: 'Generated marketing copy text',
      }),
    );
  });

  it('merges template and style into a design direction before composing', async () => {
    const templateResolver = makeTemplateResolver({
      name: 'Product Advertisement',
      description: 'd',
      prompt: 'template prompt text',
    });
    const styleRepository = makeStyleRepository({
      key: 'minimalism',
      name: 'Minimalism',
      description: 'd',
      prompt: 'style prompt text',
    });
    const designDirection = makeDesignDirection('merged direction text');
    const { svc, promptComposer } = makeService({
      templateResolver,
      styleRepository,
      designDirection,
    });

    await svc.generateImage({
      rule,
      workflowRef: 'wf1',
      contentPrompt: '',
      previousOutputs: { text: 'Some content' },
      config: { template: 'lifestyle', channel: 'instagram' },
    });

    expect(designDirection.compose).toHaveBeenCalledWith(
      expect.objectContaining({
        templateName: 'Product Advertisement',
        templatePrompt: 'template prompt text',
        styleName: 'Minimalism',
        stylePrompt: 'style prompt text',
      }),
    );
    expect(promptComposer.compose).toHaveBeenCalledWith(
      expect.objectContaining({ designDirection: 'merged direction text' }),
    );
  });

  it('uses the composed prompt when the composer succeeds', async () => {
    const promptComposer = makePromptComposer(
      'A coherent natural-language prompt.',
    );
    const { svc, promptCapture } = makeService({ promptComposer });

    await svc.generateImage({
      rule,
      workflowRef: 'wf1',
      contentPrompt: '',
      previousOutputs: { text: 'Discover our premium coffee experience.' },
      config: { template: 'lifestyle', channel: 'instagram' },
    });

    expect(promptCapture.prompt).toBe('A coherent natural-language prompt.');
  });

  it('falls back to the legacy prompt when the composer returns null', async () => {
    const promptComposer = makePromptComposer(null);
    const { svc, promptCapture } = makeService({ promptComposer });

    await svc.generateImage({
      rule,
      workflowRef: 'wf1',
      contentPrompt: '',
      previousOutputs: { text: 'Discover our premium coffee experience.' },
      config: { template: 'lifestyle', channel: 'instagram' },
    });

    expect(promptCapture.prompt).toContain('SOURCE CONTENT');
    expect(promptCapture.prompt).not.toBe(null);
  });

  it('includes the resolved design style in the legacy fallback prompt', async () => {
    const promptComposer = makePromptComposer(null);
    const styleRepository = makeStyleRepository({
      key: 'cyberpunk',
      name: 'Cyberpunk',
      description: 'd',
      prompt: 'Neon-lit dystopian urban futurism.',
    });
    const { svc, promptCapture } = makeService({ promptComposer, styleRepository });

    await svc.generateImage({
      rule,
      workflowRef: 'wf1',
      contentPrompt: '',
      previousOutputs: { text: 'Discover our premium coffee experience.' },
      config: { template: 'lifestyle', channel: 'instagram' },
    });

    expect(promptCapture.prompt).toContain('Cyberpunk');
    expect(promptCapture.prompt).toContain('Neon-lit dystopian urban futurism.');
  });

  it('does not contradict itself with "no text" for the infographic legacy fallback', async () => {
    const promptComposer = makePromptComposer(null);
    const { svc, promptCapture } = makeService({ promptComposer });

    await svc.generateImage({
      rule,
      workflowRef: 'wf1',
      contentPrompt: '',
      previousOutputs: { text: 'Q3 revenue grew 20%. Three new markets opened.' },
      config: { template: 'infographic', channel: 'instagram' },
    });

    expect(promptCapture.prompt).not.toContain(
      'Do not include any text, captions, logos, or watermarks.',
    );
    expect(promptCapture.prompt).toContain('exact labels drawn directly from the source');
  });

  it('calls the style selector when designStyle is auto (default)', async () => {
    const { svc, styleSelector, styleRepository } = makeService({});

    await svc.generateImage({
      rule,
      workflowRef: 'wf1',
      contentPrompt: '',
      previousOutputs: { text: 'Some content' },
      config: { template: 'lifestyle', channel: 'instagram' },
    });

    expect(styleSelector.select).toHaveBeenCalled();
    expect(styleRepository.getByKey).toHaveBeenCalledWith('minimalism');
  });

  it('skips the style selector and resolves the style directly when designStyle is set explicitly', async () => {
    const styleRepository = makeStyleRepository({
      key: 'cyberpunk',
      name: 'Cyberpunk',
      description: 'd',
      prompt: 'style prompt text',
    });
    const designDirection = makeDesignDirection();
    const { svc, styleSelector } = makeService({
      styleRepository,
      designDirection,
    });

    await svc.generateImage({
      rule,
      workflowRef: 'wf1',
      contentPrompt: '',
      previousOutputs: { text: 'Some content' },
      config: {
        template: 'lifestyle',
        channel: 'instagram',
        designStyle: 'cyberpunk',
      },
    });

    expect(styleSelector.select).not.toHaveBeenCalled();
    expect(styleRepository.getByKey).toHaveBeenCalledWith('cyberpunk');
    expect(designDirection.compose).toHaveBeenCalledWith(
      expect.objectContaining({ styleName: 'Cyberpunk' }),
    );
  });

  it('tolerates a missing style row (unknown key) without throwing', async () => {
    const styleRepository = makeStyleRepository(null);
    const designDirection = makeDesignDirection();
    const { svc } = makeService({ styleRepository, designDirection });

    await svc.generateImage({
      rule,
      workflowRef: 'wf1',
      contentPrompt: '',
      previousOutputs: { text: 'Some content' },
      config: { template: 'lifestyle', channel: 'instagram' },
    });

    expect(designDirection.compose).toHaveBeenCalledWith(
      expect.objectContaining({ styleName: undefined, stylePrompt: undefined }),
    );
  });
});
