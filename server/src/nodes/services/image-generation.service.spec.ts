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
        return Promise.resolve({ base64: 'abc', mimeType: 'image/png' });
      }),
      editImageBase64: jest.fn(({ prompt }: { prompt: string }) => {
        promptCapture.prompt = prompt;
        return Promise.resolve({ base64: 'edit-abc', mimeType: 'image/png' });
      }),
      uploadImageBase64: jest.fn(() =>
        Promise.resolve({
          fileUrl: 'https://files.example.com/image.png',
        }),
      ),
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
    promptComposer?: ReturnType<typeof makePromptComposer>;
  }) {
    const promptCapture: { prompt?: string } = {};
    const llm = overrides.llm ?? makeLlm(promptCapture);
    const classifier = overrides.classifier ?? { classify: jest.fn() };
    const templateResolver =
      overrides.templateResolver ?? makeTemplateResolver();
    const styleSelector = overrides.styleSelector ?? makeStyleSelector();
    const styleRepository = overrides.styleRepository ?? makeStyleRepository();
    const promptComposer = overrides.promptComposer ?? makePromptComposer();

    const svc = new ImageGenerationService(
      llm as never,
      classifier as never,
      templateResolver as never,
      styleSelector as never,
      styleRepository as never,
      promptComposer as never,
    );

    return {
      svc,
      promptCapture,
      classifier,
      templateResolver,
      styleSelector,
      styleRepository,
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

  it('passes template and style to the composer without a merged design direction', async () => {
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
    const { svc, promptComposer } = makeService({
      templateResolver,
      styleRepository,
    });

    await svc.generateImage({
      rule,
      workflowRef: 'wf1',
      contentPrompt: '',
      previousOutputs: { text: 'Some content' },
      config: { template: 'lifestyle', channel: 'instagram' },
    });

    const composeArg = (
      promptComposer.compose as jest.Mock
    ).mock.calls[0][0] as Record<string, unknown>;
    expect(composeArg.templateName).toBe('Product Advertisement');
    expect(composeArg.templatePrompt).toBe('template prompt text');
    expect(composeArg.styleName).toBe('Minimalism');
    expect(composeArg.stylePrompt).toBe('style prompt text');
    expect(composeArg).not.toHaveProperty('designDirection');
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
    expect(promptCapture.prompt).toContain('Mosonic');
    expect(promptCapture.prompt).toContain('Thai SMEs');
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
    const { svc, styleSelector, promptComposer } = makeService({
      styleRepository,
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
    expect(promptComposer.compose).toHaveBeenCalledWith(
      expect.objectContaining({ styleName: 'Cyberpunk' }),
    );
  });

  it('tolerates a missing style row (unknown key) without throwing', async () => {
    const styleRepository = makeStyleRepository(null);
    const { svc, promptComposer } = makeService({ styleRepository });

    await svc.generateImage({
      rule,
      workflowRef: 'wf1',
      contentPrompt: '',
      previousOutputs: { text: 'Some content' },
      config: { template: 'lifestyle', channel: 'instagram' },
    });

    expect(promptComposer.compose).toHaveBeenCalledWith(
      expect.objectContaining({ styleName: undefined, stylePrompt: undefined }),
    );
  });

  it('uses images.generate when sourcePack has no pixel roles', async () => {
    const promptCapture: { prompt?: string } = {};
    const llm = makeLlm(promptCapture);
    const { svc, promptComposer } = makeService({ llm });

    await svc.generateImage({
      rule,
      workflowRef: 'wf1',
      contentPrompt: 'ad for coffee',
      previousOutputs: { text: 'Try our roast' },
      config: { template: 'lifestyle', channel: 'instagram' },
      sourcePack: {
        notes: 'Product: coffee beans',
        assets: [
          {
            id: 'a1',
            kind: 'image',
            label: 'photo.jpg',
            fileUrl: 'https://files.example.com/photo.jpg',
            role: 'context_only',
            confidence: 0.5,
          },
        ],
      },
    });

    expect(llm.generateImageBase64).toHaveBeenCalled();
    expect(llm.editImageBase64).not.toHaveBeenCalled();
    expect(promptComposer.compose).toHaveBeenCalledWith(
      expect.objectContaining({
        sourcePackNotes: 'Product: coffee beans',
        referenceImages: undefined,
      }),
    );
  });

  it('uses images.edit when sourcePack has pixel roles', async () => {
    const promptCapture: { prompt?: string } = {};
    const llm = makeLlm(promptCapture);
    const { svc, promptComposer } = makeService({ llm });

    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      arrayBuffer: async () => Uint8Array.from([1, 2, 3, 4]).buffer,
      headers: { get: () => 'image/png' },
    } as unknown as Response);

    try {
      await svc.generateImage({
        rule,
        workflowRef: 'wf1',
        contentPrompt: 'use this logo on the ad',
        previousOutputs: { text: 'Try our roast' },
        config: { template: 'ad_creative', channel: 'instagram' },
        sourcePack: {
          notes: 'Logo attached',
          assets: [
            {
              id: 'logo1',
              kind: 'image',
              label: 'logo.png',
              fileUrl: 'https://files.example.com/logo.png',
              mime: 'image/png',
              role: 'brand_mark',
              confidence: 0.9,
            },
          ],
        },
      });

      expect(llm.editImageBase64).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.any(String),
          images: expect.arrayContaining([
            expect.objectContaining({
              fileName: expect.stringContaining('logo1'),
              mimeType: 'image/png',
            }),
          ]),
        }),
      );
      expect(llm.generateImageBase64).not.toHaveBeenCalled();
      expect(promptComposer.compose).toHaveBeenCalledWith(
        expect.objectContaining({
          referenceImages: [
            expect.objectContaining({
              index: 1,
              label: 'logo.png',
              role: 'brand_mark',
            }),
          ],
        }),
      );
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('skips the scene composer for a keep-scene edit', async () => {
    const promptComposer = makePromptComposer();
    const classifier = { classify: jest.fn() };
    const promptCapture: { prompt?: string } = {};
    const llm = makeLlm(promptCapture);
    const { svc } = makeService({ promptComposer, classifier, llm });
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      arrayBuffer: async () => Uint8Array.from([1, 2, 3, 4]).buffer,
      headers: { get: () => 'image/png' },
    } as unknown as Response);
    await svc.execute({
      pipelineRef: 'p1',
      workflowRef: 'wf1',
      nodeId: 'img',
      order: 2,
      rule,
      contentPrompt: 'ignored',
      previousOutputs: { text: 'caption', image: 'https://files.example.com/prev.png' },
      imageEdit: { instruction: 'add the logo top-right', useBrandLogo: true },
      sourcePack: {
        notes: '',
        assets: [
          {
            id: 'previous_output',
            kind: 'image',
            label: 'previous_output',
            fileUrl: 'https://files.example.com/prev.png',
            role: 'enhance',
            confidence: 1,
          },
          {
            id: 'logo-1',
            kind: 'image',
            label: 'wiser-logo.png',
            fileUrl: 'https://files.example.com/logo.png',
            role: 'brand_mark',
            confidence: 1,
          },
        ],
      },
    });
    expect(promptComposer.compose).not.toHaveBeenCalled();
    expect(classifier.classify).not.toHaveBeenCalled();
    expect(promptCapture.prompt).toContain('Edit Image 1');
    expect(promptCapture.prompt).toContain('add the logo top-right');
    expect(promptCapture.prompt).toContain('Image 2 is the real brand logo file');
    expect(llm.editImageBase64).toHaveBeenCalledWith(
      expect.objectContaining({
        images: [
          expect.objectContaining({ fileName: expect.stringContaining('previous_output') }),
          expect.objectContaining({ fileName: expect.stringContaining('logo-1') }),
        ],
      }),
    );
    fetchMock.mockRestore();
  });

  it('downloads port-stripped 4001/api/file refs through FILE_SERVICE_URL', async () => {
    const prev = process.env.FILE_SERVICE_URL;
    process.env.FILE_SERVICE_URL = 'https://files.example.com/api/file/v1';
    const promptCapture: { prompt?: string } = {};
    const llm = makeLlm(promptCapture);
    const { svc } = makeService({ llm });
    const pngMagic = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4,
    ]);
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      arrayBuffer: async () => pngMagic.buffer,
      headers: { get: () => 'application/octet-stream' },
    } as unknown as Response);
    try {
      await svc.execute({
        pipelineRef: 'p1',
        workflowRef: 'wf1',
        nodeId: 'img',
        order: 2,
        rule,
        previousOutputs: { text: 'caption' },
        imageEdit: { instruction: 'use brand logo', useBrandLogo: true },
        sourcePack: {
          notes: '',
          assets: [
            {
              id: 'previous_output',
              kind: 'image',
              label: 'previous_output',
              fileUrl:
                '4001/api/file/v1/file?relativePath=testing%2Fneural-tex%2Fprev.png',
              role: 'enhance',
              confidence: 1,
            },
            {
              id: 'logo-1',
              kind: 'image',
              label: 'logo-icon.png',
              fileUrl:
                '4001/api/file/v1/file?relativePath=rule-assets%2Flogo.png',
              role: 'brand_mark',
              confidence: 1,
            },
          ],
        },
      });
      const fetched = fetchMock.mock.calls.map((call) => String(call[0]));
      expect(fetched.every((url) => url.startsWith('https://'))).toBe(true);
      expect(llm.editImageBase64).toHaveBeenCalledWith(
        expect.objectContaining({
          images: expect.arrayContaining([
            expect.objectContaining({ mimeType: 'image/png' }),
          ]),
        }),
      );
    } finally {
      fetchMock.mockRestore();
      process.env.FILE_SERVICE_URL = prev;
    }
  });

  it('refuses a logo edit when the rule logo is not in the pack', async () => {
    const { svc } = makeService({});
    await expect(
      svc.execute({
        pipelineRef: 'p1',
        workflowRef: 'wf1',
        nodeId: 'img',
        order: 2,
        rule,
        contentPrompt: 'ignored',
        previousOutputs: { text: 'caption', image: 'https://files.example.com/prev.png' },
        imageEdit: { instruction: 'use the brand logo', useBrandLogo: true },
        sourcePack: {
          notes: '',
          assets: [
            {
              id: 'previous_output',
              kind: 'image',
              label: 'previous_output',
              fileUrl: 'https://files.example.com/prev.png',
              role: 'enhance',
              confidence: 1,
            },
          ],
        },
      }),
    ).rejects.toThrow(/no ready logo asset/i);
  });
});
