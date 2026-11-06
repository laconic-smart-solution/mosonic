import { createCreateRuleFromIntakeTool } from './create-rule-from-intake.tool';
import type { RuleService } from '../rule.service';
import type { TenancyAuth } from '../../auth/tenancy.types';

describe('createCreateRuleFromIntakeTool', () => {
  const auth = { userId: 'user-1' } as TenancyAuth;

  function makeRuleService(ruleId = 'rule-1') {
    return {
      requestExtraction: jest.fn().mockResolvedValue({ ruleId }),
    } as unknown as RuleService;
  }

  it('passes a valid http(s) url through to requestExtraction', async () => {
    const ruleService = makeRuleService();
    const onRuleCreated = jest.fn();
    const chatTool = createCreateRuleFromIntakeTool(ruleService, auth, onRuleCreated);

    const result = await chatTool.invoke({
      description: 'Acme Coffee, a coffee shop brand.',
      url: 'https://acme-coffee.co',
    });

    expect(ruleService.requestExtraction).toHaveBeenCalledWith(
      {
        input: 'Acme Coffee, a coffee shop brand.',
        files: [],
        urls: ['https://acme-coffee.co'],
        intake: undefined,
      },
      auth,
    );
    expect(onRuleCreated).toHaveBeenCalledWith('rule-1');
    expect(result).toContain('Started building the brand profile');
  });

  it('rejects a non-URL value without creating a profile', async () => {
    const ruleService = makeRuleService();
    const onRuleCreated = jest.fn();
    const chatTool = createCreateRuleFromIntakeTool(ruleService, auth, onRuleCreated);

    const result = await chatTool.invoke({
      description: 'Wai Yan Linn, a portfolio site.',
      url: 'check this one',
    });

    expect(ruleService.requestExtraction).not.toHaveBeenCalled();
    expect(onRuleCreated).not.toHaveBeenCalled();
    expect(JSON.parse(result)).toMatchObject({ ok: false, code: 'url_not_provided' });
  });

  it('rejects placeholder sites like example.com (I-03)', async () => {
    const ruleService = makeRuleService();
    const chatTool = createCreateRuleFromIntakeTool(ruleService, auth, jest.fn(), () => [
      'User choice: website_url (I have a website URL)',
    ]);

    for (const url of ['https://example.com', 'http://localhost:3000', 'https://www.example.org/x']) {
      const result = await chatTool.invoke({ description: 'A business.', url });
      expect(JSON.parse(result)).toMatchObject({ ok: false, code: 'url_not_provided' });
    }
    expect(ruleService.requestExtraction).not.toHaveBeenCalled();
  });

  it('rejects a real-looking URL the user never sent', async () => {
    const ruleService = makeRuleService();
    const chatTool = createCreateRuleFromIntakeTool(ruleService, auth, jest.fn(), () => [
      'hi, make me some content',
    ]);
    const result = await chatTool.invoke({
      description: 'A business.',
      url: 'https://www.starbucks.co.th',
    });
    expect(JSON.parse(result)).toMatchObject({ ok: false, code: 'url_not_provided' });
    expect(ruleService.requestExtraction).not.toHaveBeenCalled();
  });

  it('accepts a URL the user typed (with or without www)', async () => {
    const ruleService = makeRuleService();
    const chatTool = createCreateRuleFromIntakeTool(ruleService, auth, jest.fn(), () => [
      'our site is starbucks.co.th',
    ]);
    const result = await chatTool.invoke({
      description: 'A business.',
      url: 'https://www.starbucks.co.th',
    });
    expect(result).toContain('Started building the brand profile');
    expect(ruleService.requestExtraction).toHaveBeenCalledWith(
      expect.objectContaining({ urls: ['https://www.starbucks.co.th'] }),
      auth,
    );
  });

  it('omits the url entirely when none was given', async () => {
    const ruleService = makeRuleService();
    const onRuleCreated = jest.fn();
    const chatTool = createCreateRuleFromIntakeTool(ruleService, auth, onRuleCreated);

    await chatTool.invoke({ description: 'Just a name and industry.' });

    expect(ruleService.requestExtraction).toHaveBeenCalledWith(
      {
        input: 'Just a name and industry.',
        files: [],
        urls: [],
        intake: undefined,
      },
      auth,
    );
  });
});

describe('intakeFromArgs', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { intakeFromArgs } = require('./create-rule-from-intake.tool');
  it('pins the confirmed name and known channels as guided intake', () => {
    expect(intakeFromArgs('EVAL-Lumi', ['Instagram', 'TikTok', 'medium'])).toEqual({
      mode: 'guided',
      brandName: 'EVAL-Lumi',
      channels: [
        { channel: 'instagram', priority: 'high' },
        { channel: 'tiktok', priority: 'high' },
      ],
    });
  });
  it('returns undefined when nothing was given', () => {
    expect(intakeFromArgs(undefined, [])).toBeUndefined();
  });
});

describe('channels the user named (Facebook-only brand must not get 5 lanes)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { channelsNamedIn } = require('./create-rule-from-intake.tool');
  const auth = { userId: 'user-1' } as TenancyAuth;

  it('finds channels in the user texts, including links and nicknames, and skips ruled-out ones', () => {
    expect(channelsNamedIn(['We only post on Facebook'])).toEqual(['facebook']);
    expect(channelsNamedIn(['page: https://www.facebook.com/lumicafe', 'and IG too'])).toEqual(['facebook', 'instagram']);
    expect(channelsNamedIn(['Facebook, not TikTok'])).toEqual(['facebook']);
    expect(channelsNamedIn(['โพสต์แค่เฟซบุ๊ก'])).toEqual(['facebook']);
    expect(channelsNamedIn(['A bakery in Bangkok', 'big cakes'])).toEqual([]);
  });

  it('pins the named channels when the model leaves channels out', async () => {
    const ruleService = { requestExtraction: jest.fn().mockResolvedValue({ ruleId: 'rule-1' }) } as unknown as RuleService;
    const chatTool = createCreateRuleFromIntakeTool(ruleService, auth, jest.fn(), () => [
      'Lumi Cafe, a coffee shop. We only use Facebook.',
    ]);
    await chatTool.invoke({ description: 'Lumi Cafe, a coffee shop.', brandName: 'Lumi Cafe' });
    expect((ruleService.requestExtraction as jest.Mock).mock.calls[0][0].intake).toEqual({
      mode: 'guided',
      brandName: 'Lumi Cafe',
      channels: [{ channel: 'facebook', priority: 'high' }],
    });
  });

  it('keeps an explicit channels arg over what the texts mention', async () => {
    const ruleService = { requestExtraction: jest.fn().mockResolvedValue({ ruleId: 'rule-1' }) } as unknown as RuleService;
    const chatTool = createCreateRuleFromIntakeTool(ruleService, auth, jest.fn(), () => ['Facebook and Instagram']);
    await chatTool.invoke({ description: 'Lumi', channels: ['instagram'] });
    expect((ruleService.requestExtraction as jest.Mock).mock.calls[0][0].intake.channels).toEqual([
      { channel: 'instagram', priority: 'high' },
    ]);
  });

  it('nudges continuing a post Goal instead of only waiting for the next message', async () => {
    const ruleService = { requestExtraction: jest.fn().mockResolvedValue({ ruleId: 'rule-1' }) } as unknown as RuleService;
    const chatTool = createCreateRuleFromIntakeTool(
      ruleService,
      auth,
      jest.fn(),
      () => ['I want to make a post about One Piece'],
      () => true,
    );
    const result = await chatTool.invoke({
      description: 'Anime brand',
      brandName: 'Duco',
    });
    expect(result).toContain('Continue the user');
    expect(result).toContain('start_generation');
    expect(result).not.toMatch(/from your next message/);
  });

});
