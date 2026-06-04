import { ZernioController } from './zernio.controller';

jest.mock('jose', () => ({
  SignJWT: class SignJWT {},
  jwtVerify: jest.fn(),
}));

describe('ZernioController', () => {
  const mcpService = {
    ensureZernioProfile: jest.fn(),
    getConnectUrl: jest.fn(),
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

  it('returns connect url for platform', async () => {
    mcpService.getConnectUrl.mockResolvedValue('https://zernio/connect');
    const req = { auth: { localUser: { userId: 'u1' } } };
    const res = await controller.connectAccount(req as never, 'instagram');
    expect(res).toEqual({ connectUrl: 'https://zernio/connect' });
  });

  it('redirects callback success to settings/accounts', async () => {
    const redirect = jest.fn();
    await controller.handleCallback(
      { platform: 'instagram', state: 'x', accountId: 'a1' },
      { redirect } as never,
    );
    expect(redirect).toHaveBeenCalledWith(
      expect.stringContaining('/settings/accounts?connected=instagram'),
    );
  });
});

