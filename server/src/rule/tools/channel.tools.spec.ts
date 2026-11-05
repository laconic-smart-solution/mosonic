import {
  createCheckChannelAuthTool,
  createListChannelsTool,
  createStartChannelOauthTool,
  isOAuthStartObservation,
} from './channel.tools';

const auth = { userId: 'u1', role: 'CUSTOMER' } as const;

describe('channel.tools', () => {
  const ruleService = {
    getRuleById: jest.fn().mockResolvedValue({
      ruleId: 'r1',
      channels: [{ channel: 'tiktok', priority: 'high' }],
    }),
  };
  const mcp = {
    getConnectedAccounts: jest.fn().mockResolvedValue({
      accounts: [{ channel: 'tiktok', accountId: 'a1', username: 'brand' }],
    }),
    connectChannel: jest.fn().mockResolvedValue({
      connectUrl: 'https://zernio.example/connect',
    }),
  };
  const planAccess = {
    isChannelAllowed: jest.fn().mockResolvedValue(true),
  };
  const rednote = {
    getAccountStatus: jest.fn().mockResolvedValue({
      connected: false,
      needsReauth: false,
      handle: null,
    }),
    startConnect: jest.fn().mockResolvedValue({ socketRoom: 'rednote:u1' }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('list_channels returns brand vs auth rows', async () => {
    const tool = createListChannelsTool(
      'r1',
      ruleService as never,
      mcp as never,
      planAccess as never,
      rednote as never,
      auth as never,
    );
    const raw = await tool.invoke({});
    const parsed = JSON.parse(raw as string);
    expect(parsed.ok).toBe(true);
    expect(parsed.action).toBe('list_channels');
    expect(parsed.brandChannels).toContain('tiktok');
    const tiktok = parsed.channels.find(
      (c: { channel: string }) => c.channel === 'tiktok',
    );
    expect(tiktok.auth).toBe('connected');
    expect(tiktok.username).toBe('brand');
  });

  it('check_channel_auth reports missing', async () => {
    mcp.getConnectedAccounts.mockResolvedValueOnce({ accounts: [] });
    const tool = createCheckChannelAuthTool(
      'r1',
      ruleService as never,
      mcp as never,
      planAccess as never,
      rednote as never,
      auth as never,
    );
    const raw = await tool.invoke({ channel: 'instagram' });
    const parsed = JSON.parse(raw as string);
    expect(parsed.ok).toBe(true);
    expect(parsed.auth).toBe('missing');
  });

  it('start_channel_oauth returns connect URL for Zernio channels', async () => {
    const tool = createStartChannelOauthTool(
      mcp as never,
      rednote as never,
      auth as never,
    );
    const raw = await tool.invoke({ channel: 'instagram' });
    const parsed = JSON.parse(raw as string);
    expect(parsed.action).toBe('start_oauth');
    expect(parsed.connectUrl).toContain('https://');
    expect(mcp.connectChannel).toHaveBeenCalledWith('instagram', 'u1', {
      returnTo: '/home',
    });
    expect(isOAuthStartObservation(raw as string)).toBe(true);
  });

  it('start_channel_oauth returns RedNote QR marker', async () => {
    const tool = createStartChannelOauthTool(
      mcp as never,
      rednote as never,
      auth as never,
    );
    const raw = await tool.invoke({ channel: 'rednote' });
    const parsed = JSON.parse(raw as string);
    expect(parsed.action).toBe('start_rednote_qr');
    expect(parsed.socketRoom).toBe('rednote:u1');
    expect(isOAuthStartObservation(raw as string)).toBe(true);
  });
});
