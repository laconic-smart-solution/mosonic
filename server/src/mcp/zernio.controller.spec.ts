import { ZernioController } from './zernio.controller';

jest.mock('jose', () => ({
  SignJWT: class SignJWT {},
  jwtVerify: jest.fn(),
}));

describe('ZernioController', () => {
  const mcpService = {
    ensureZernioProfile: jest.fn(),
    connectChannel: jest.fn(),
    handleOAuthCallback: jest.fn(),
    syncAccounts: jest.fn(),
    getConnectedAccounts: jest.fn(),
    disconnectAccount: jest.fn(),
  };
  const config = {
    get: jest.fn().mockReturnValue('http://localhost:5173'),
  };

  const controller = new ZernioController(mcpService as never, config as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns connect url for unlocked channel', async () => {
    mcpService.connectChannel.mockResolvedValue({
      connectUrl: 'https://zernio/connect',
    });
    const req = { auth: { localUser: { userId: 'u1' } } };
    const res = await controller.connectChannel(req as never, 'instagram');
    expect(res).toEqual({ connectUrl: 'https://zernio/connect' });
  });

  it('redirects callback success to settings/accounts', async () => {
    mcpService.handleOAuthCallback.mockResolvedValue({ platform: 'instagram' });
    const redirect = jest.fn();
    await controller.handleCallback(
      { connected: 'instagram', state: 'x', accountId: 'a1' },
      { redirect } as never,
    );
    expect(mcpService.handleOAuthCallback).toHaveBeenCalledWith({
      connected: 'instagram',
      state: 'x',
      accountId: 'a1',
    });
    expect(redirect).toHaveBeenCalledWith(
      expect.stringContaining('/settings/accounts?connected=instagram'),
    );
  });

  it('redirects callback failure to zernio_error', async () => {
    mcpService.handleOAuthCallback.mockRejectedValue(new Error('bad state'));
    const redirect = jest.fn();
    await controller.handleCallback({ state: 'bad' }, { redirect } as never);
    expect(redirect).toHaveBeenCalledWith(
      expect.stringContaining('zernio_error=callback_failed'),
    );
  });
});
