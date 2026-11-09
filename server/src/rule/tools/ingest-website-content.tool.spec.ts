import { createIngestWebsiteContentTool } from './ingest-website-content.tool';
import type { RuleService } from '../rule.service';
import type { TenancyAuth } from '../../auth/tenancy.types';

describe('createIngestWebsiteContentTool', () => {
  const auth = { userId: 'user-1' } as TenancyAuth;

  function makeRuleService(overrides?: Partial<RuleService>) {
    return {
      patchRule: jest.fn().mockResolvedValue({}),
      extractIntoRuleAndAwait: jest.fn().mockResolvedValue({
        status: 'COMPLETED',
        rule: {
          name: 'Beauty Phoo',
          brand: {
            brandName: 'Beauty Phoo',
            brandDescription: 'Natural herbal cosmetics and teas',
            industry: 'Cosmetics',
          },
        },
      }),
      ...overrides,
    } as unknown as RuleService;
  }

  it('refuses to run when no rule exists', async () => {
    const ruleService = makeRuleService();
    const chatTool = createIngestWebsiteContentTool(() => null, ruleService, auth);
    const result = await chatTool.invoke({ url: 'https://beautyphoo.com' });
    expect(result).toContain('No brand profile exists yet');
  });

  it('rejects untrusted URLs not in user texts', async () => {
    const ruleService = makeRuleService();
    const chatTool = createIngestWebsiteContentTool(
      () => 'rule-1',
      ruleService,
      auth,
      () => ['hello there'],
    );
    const result = await chatTool.invoke({ url: 'https://untrusted-url.com' });
    expect(result).toContain('url_not_provided');
  });

  it('ingests website content and returns structured completed output', async () => {
    const ruleService = makeRuleService();
    const chatTool = createIngestWebsiteContentTool(
      () => 'rule-1',
      ruleService,
      auth,
      () => ['here is my brand website: https://beautyphoo.com'],
    );

    const resultStr = await chatTool.invoke({ url: 'https://beautyphoo.com' });
    const parsed = JSON.parse(resultStr);

    expect(ruleService.extractIntoRuleAndAwait).toHaveBeenCalledWith(
      'rule-1',
      expect.objectContaining({
        urls: ['https://beautyphoo.com'],
      }),
      auth,
      expect.any(Number),
    );
    expect(parsed.status).toBe('COMPLETED');
    expect(parsed.readiness).toBe('READY');
    expect(parsed.brandName).toBe('Beauty Phoo');
  });

  it('handles extraction failure and reports failure without fake success', async () => {
    const ruleService = makeRuleService({
      extractIntoRuleAndAwait: jest.fn().mockResolvedValue({
        status: 'FAILED',
        error: 'Cloudflare security verification blocked fetch',
      }),
    });
    const chatTool = createIngestWebsiteContentTool(
      () => 'rule-1',
      ruleService,
      auth,
      () => ['https://blocked-site.com'],
    );

    const resultStr = await chatTool.invoke({ url: 'https://blocked-site.com' });
    const parsed = JSON.parse(resultStr);

    expect(parsed.status).toBe('FAILED');
    expect(parsed.readiness).toBe('FAILED');
    expect(parsed.error).toContain('Cloudflare security verification');
  });
});

