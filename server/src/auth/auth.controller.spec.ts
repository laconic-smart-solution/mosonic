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

    cookies = {} as unknown as jest.Mocked<AuthCookieService>;

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

    const res = {
      redirect: jest.fn(),
    } as never;

    await controller.startExchange('xyz123', '/custom-path', res);

    expect(eventAppClient.validateExchangeCode).toHaveBeenCalledWith('xyz123');
    expect(sso.resendOtpByEmail).toHaveBeenCalledWith({
      email: 'organizer@example.com',
    });
    expect((res as any).redirect).toHaveBeenCalledWith(
      302,
      'https://mosonic.me/auth/otp?email=organizer%40example.com&redirectPath=%2Fcustom-path',
    );
  });

  it('redirects to login error page on invalid code', async () => {
    eventAppClient.validateExchangeCode.mockRejectedValueOnce(
      new Error('Code expired'),
    );

    const res = {
      redirect: jest.fn(),
    } as never;

    await controller.startExchange('invalid-code', undefined, res);

    expect((res as any).redirect).toHaveBeenCalledWith(
      302,
      'https://mosonic.me/auth/login?error=invalid_or_expired_code',
    );
  });
});
