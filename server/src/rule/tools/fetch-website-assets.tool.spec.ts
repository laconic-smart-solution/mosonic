import { createFetchWebsiteAssetsTool } from './fetch-website-assets.tool';
import type { WebsiteAssetHandler } from '../../preprocessing/handlers/website-asset.handler';
import type { RuleAssetService } from '../rule-asset.service';
import type { TenancyAuth } from '../../auth/tenancy.types';

describe('createFetchWebsiteAssetsTool', () => {
  const auth = { userId: 'user-1' } as TenancyAuth;

  function makeHandler(
    images: Array<{
      sourceUrl: string;
      buffer: Buffer;
      mimeType: string;
      originalFileName: string;
      kind: 'icon' | 'og' | 'img';
    }>,
  ) {
    return {
      discoverImages: jest.fn().mockResolvedValue(images),
    } as unknown as WebsiteAssetHandler;
  }

  function makeRuleAssetService() {
    return {
      upload: jest.fn().mockResolvedValue({}),
    } as unknown as RuleAssetService;
  }

  it('refuses to run before a Rule exists', async () => {
    const handler = makeHandler([]);
    const ruleAssetService = makeRuleAssetService();
    const chatTool = createFetchWebsiteAssetsTool(
      () => null,
      handler,
      ruleAssetService,
      auth,
    );

    const result = await chatTool.invoke({ url: 'https://brew-co.coffee' });

    expect(handler.discoverImages).not.toHaveBeenCalled();
    expect(result).toContain('No brand profile exists yet');
  });

  it('rejects a non-URL value without calling the handler', async () => {
    const handler = makeHandler([]);
    const ruleAssetService = makeRuleAssetService();
    const chatTool = createFetchWebsiteAssetsTool(
      () => 'rule-1',
      handler,
      ruleAssetService,
      auth,
    );

    const result = await chatTool.invoke({ url: 'not a url' });

    expect(handler.discoverImages).not.toHaveBeenCalled();
    expect(result).toContain('not a usable link');
  });

  it('saves the first image as logo and the rest as reference_image', async () => {
    const images = [
      {
        sourceUrl: 'https://brew-co.coffee/favicon.png',
        buffer: Buffer.from('a'),
        mimeType: 'image/png',
        originalFileName: 'favicon.png',
        kind: 'icon' as const,
      },
      {
        sourceUrl: 'https://brew-co.coffee/hero.jpg',
        buffer: Buffer.from('b'),
        mimeType: 'image/jpeg',
        originalFileName: 'hero.jpg',
        kind: 'img' as const,
      },
    ];
    const handler = makeHandler(images);
    const ruleAssetService = makeRuleAssetService();
    const chatTool = createFetchWebsiteAssetsTool(
      () => 'rule-1',
      handler,
      ruleAssetService,
      auth,
    );

    const result = await chatTool.invoke({ url: 'https://brew-co.coffee' });

    expect(handler.discoverImages).toHaveBeenCalledWith('https://brew-co.coffee', 8);
    expect(ruleAssetService.upload).toHaveBeenNthCalledWith(
      1,
      'rule-1',
      'logo',
      expect.objectContaining({ originalname: 'favicon.png', mimetype: 'image/png' }),
      auth,
    );
    expect(ruleAssetService.upload).toHaveBeenNthCalledWith(
      2,
      'rule-1',
      'reference_image',
      expect.objectContaining({ originalname: 'hero.jpg', mimetype: 'image/jpeg' }),
      auth,
    );
    expect(result).toContain('Saved 2 asset(s)');
  });

  it('reports when no usable images were found', async () => {
    const handler = makeHandler([]);
    const ruleAssetService = makeRuleAssetService();
    const chatTool = createFetchWebsiteAssetsTool(
      () => 'rule-1',
      handler,
      ruleAssetService,
      auth,
    );

    const result = await chatTool.invoke({ url: 'https://brew-co.coffee' });

    expect(result).toContain('No usable images found');
    expect(ruleAssetService.upload).not.toHaveBeenCalled();
  });

  it('rejects placeholder and unseen URLs (I-03)', async () => {
    const handler = makeHandler([]);
    const ruleAssetService = makeRuleAssetService();
    const chatTool = createFetchWebsiteAssetsTool(
      () => 'rule-1',
      handler,
      ruleAssetService,
      auth,
      () => ['I have a website URL'],
    );

    for (const url of ['https://example.com', 'https://brew-co.coffee']) {
      const result = await chatTool.invoke({ url });
      expect(JSON.parse(result)).toMatchObject({ ok: false, code: 'url_not_provided' });
    }
    expect(handler.discoverImages).not.toHaveBeenCalled();
  });

  it('accepts a URL a web search found, without asking the user again', async () => {
    const handler = makeHandler([]);
    const ruleAssetService = makeRuleAssetService();
    const chatTool = createFetchWebsiteAssetsTool(
      () => 'rule-1',
      handler,
      ruleAssetService,
      auth,
      () => ['yes can get images from that website? it is my brand', 'Beauty Phoo official site: https://www.beautyphoo.com'],
    );

    await chatTool.invoke({ url: 'https://beautyphoo.com' });
    expect(handler.discoverImages).toHaveBeenCalledWith('https://beautyphoo.com', expect.any(Number));
  });

  it('calls seedBlankBrand after a successful save', async () => {
    const images = [
      {
        sourceUrl: 'https://brew-co.coffee/favicon.png',
        buffer: Buffer.from('a'),
        mimeType: 'image/png',
        originalFileName: 'favicon.png',
        kind: 'icon' as const,
      },
    ];
    const handler = makeHandler(images);
    const ruleAssetService = makeRuleAssetService();
    const seed = jest.fn().mockResolvedValue(undefined);
    const chatTool = createFetchWebsiteAssetsTool(
      () => 'rule-1',
      handler,
      ruleAssetService,
      auth,
      () => ['https://brew-co.coffee'],
      seed,
    );

    const result = await chatTool.invoke({ url: 'https://brew-co.coffee' });

    expect(seed).toHaveBeenCalledWith('rule-1', 'https://brew-co.coffee');
    expect(result).toContain('Seeded brand name');
    expect(result).toContain('do not stop at assets alone');
  });
});