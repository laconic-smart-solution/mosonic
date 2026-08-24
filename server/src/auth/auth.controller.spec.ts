jest.mock('./jwt-auth.guard', () => ({
  JwtAuthGuard: jest.fn().mockImplementation(() => ({})),
}));

import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthCookieService } from './auth-cookie.service';
import { EventAppClientService } from './event-app-client.service';
import { SsoClientService } from './sso-client.service';

describe('AuthController - SSO Exchange', () => {
  let controller: AuthController;
  let sso: jest.Mocked<SsoClientService>;
  let eventAppClient: jest.Mocked<EventAppClientService>;
  let cookies: jest.Mocked<AuthCookieService>;
  let config: ConfigService;

  beforeEach(() => {
    sso = {
      resendOtpByEmail: jest.fn().mockResolvedValue({ success: true }),
    } as unknown as jest.Mocked<SsoClientService>;

    eventAppClient = {
      validateExchangeCode: jest.fn(),
    } as unknown as jest.Mocked<EventAppClientService>;

    cookies = {
      readAccessToken: jest.fn().mockReturnValue(null),
      clearTokens: jest.fn(),
    } as unknown as jest.Mocked<AuthCookieService>;

    config = new ConfigService({
      FRONTEND_URL: 'https://mosonic.me',
    });

    controller = new AuthController(sso, eventAppClient, cookies, config);
  });

  it('redirects to OTP page on valid code', async () => {
    eventAppClient.validateExchangeCode.mockResolvedValueOnce({
      valid: true,
      email: 'organizer@example.com',
      redirectPath: '/dashboard',
    });

    const req = {} as never;
    const res = {
      redirect: jest.fn(),
    } as never;

    await controller.startExchange('xyz123', '/custom-path', req, undefined, res);

    expect(eventAppClient.validateExchangeCode).toHaveBeenCalledWith('xyz123');
    expect(sso.resendOtpByEmail).toHaveBeenCalledWith({
      email: 'organizer@example.com',
    });
    expect(cookies.clearTokens).toHaveBeenCalledWith(res);
    expect((res as any).redirect).toHaveBeenCalledWith(
      302,
      'https://mosonic.me/verify-otp?email=organizer%40example.com&redirectPath=%2Fcustom-path%3Fsource%3Dcrabonic',
    );
  });

  it('preserves the existing session when the exchange code names the same user', async () => {
    eventAppClient.validateExchangeCode.mockResolvedValueOnce({
      valid: true,
      email: 'organizer@example.com',
      authServerUserId: 'auth-user-1',
      redirectPath: '/dashboard',
    });

    const payload = { sub: 'auth-user-1', email: 'organizer@example.com' };
    const token = `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.sig`;
    (cookies.readAccessToken as jest.Mock).mockReturnValueOnce(token);

    const req = {} as never;
    const res = {
      redirect: jest.fn(),
    } as never;

    await controller.startExchange('xyz123', '/custom-path', req, undefined, res);

    expect(cookies.clearTokens).not.toHaveBeenCalled();
  });

  it('clears a stale session belonging to a different user before redirecting to OTP', async () => {
    eventAppClient.validateExchangeCode.mockResolvedValueOnce({
      valid: true,
      email: 'new-user@example.com',
      authServerUserId: 'auth-user-2',
      redirectPath: '/dashboard',
    });

    const payload = { sub: 'auth-user-1', email: 'organizer@example.com' };
    const token = `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.sig`;
    (cookies.readAccessToken as jest.Mock).mockReturnValueOnce(token);

    const req = {} as never;
    const res = {
      redirect: jest.fn(),
    } as never;

    await controller.startExchange('xyz123', '/custom-path', req, undefined, res);

    expect(cookies.clearTokens).toHaveBeenCalledWith(res);
  });

  it('redirects to login error page on invalid code', async () => {
    eventAppClient.validateExchangeCode.mockRejectedValueOnce(
      new Error('Code expired'),
    );

    const req = {} as never;
    const res = {
      redirect: jest.fn(),
    } as never;

    await controller.startExchange('invalid-code', undefined, req, undefined, res);

    expect((res as any).redirect).toHaveBeenCalledWith(
      302,
      'https://mosonic.me/login?error=invalid_or_expired_code',
    );
  });

  describe('verifyOrigin', () => {
    it('returns identity info without setting any cookies', async () => {
      eventAppClient.validateExchangeCode.mockResolvedValueOnce({
        valid: true,
        email: 'organizer@example.com',
        redirectPath: '/dashboard',
      });

      const result = await controller.verifyOrigin({ code: 'xyz123' });

      expect(eventAppClient.validateExchangeCode).toHaveBeenCalledWith(
        'xyz123',
      );
      expect(result).toEqual({
        valid: true,
        email: 'organizer@example.com',
        redirectPath: '/dashboard?source=crabonic',
      });
    });

    it('propagates the error for an invalid or expired code', async () => {
      eventAppClient.validateExchangeCode.mockRejectedValueOnce(
        new Error('Code expired'),
      );

      await expect(
        controller.verifyOrigin({ code: 'bad-code' }),
      ).rejects.toThrow('Code expired');
    });
  });
});
