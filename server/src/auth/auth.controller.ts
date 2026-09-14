import {
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import {
  extractAuthCookieTokens,
  toAuthSessionDto,
} from './auth-response.util';
import { AuthCookieService } from './auth-cookie.service';
import type { SsoTokenClaims } from './auth.types';
import { AuthChangePasswordDto } from './dto/auth-change-password.dto';
import { AuthLoginDto } from './dto/auth-login.dto';
import { AuthResendOtpDto } from './dto/auth-resend-otp.dto';
import { AuthSignupDto } from './dto/auth-signup.dto';
import { AuthVerifyOriginDto } from './dto/auth-verify-origin.dto';
import { AuthVerifyOtpDto } from './dto/auth-verify-otp.dto';
import { EventAppClientService } from './event-app-client.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { SsoClientService } from './sso-client.service';

const bodyPipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

@Controller('auth')
@ApiTags('Auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly sso: SsoClientService,
    private readonly eventAppClient: EventAppClientService,
    private readonly cookies: AuthCookieService,
    private readonly config: ConfigService,
  ) {}

  @Get('start')
  @ApiOperation({
    summary: 'Initiate SSO authentication from Event App',
    description:
      'Validates single-use exchange code from Event App, sends OTP email, and redirects user to Mosonic OTP page',
  })
  @ApiQuery({
    name: 'code',
    required: true,
    description: 'Single-use exchange code',
  })
  @ApiQuery({
    name: 'redirect_path',
    required: false,
    description: 'Destination redirect path',
  })
  @ApiQuery({
    name: 'source',
    required: false,
    description: 'Referral source tracking',
  })
  async startExchange(
    @Query('code') code: string,
    @Query('redirect_path') redirectPath: string | undefined,
    @Req() req: Request,
    @Query('source') source: string | undefined,
    @Res() res: Response,
  ) {
    const frontendUrl =
      this.config.get<string>('FRONTEND_URL')?.trim().replace(/\/$/, '') ||
      'http://localhost:5173';

    try {
      const userInfo = await this.eventAppClient.validateExchangeCode(code);

      let targetRedirect =
        redirectPath || userInfo.redirectPath || '/dashboard?source=crabonic';
      if (!targetRedirect.startsWith('/')) {
        targetRedirect = '/dashboard?source=crabonic';
      }
      const refSource = source || 'crabonic';
      if (!targetRedirect.includes('source=')) {
        targetRedirect +=
          (targetRedirect.includes('?') ? '&' : '?') +
          `source=${encodeURIComponent(refSource)}`;
      }

      // 1-Click Seamless SSO: If the exchange code provided the user's active SSO access token,
      // establish the session cookie immediately and navigate straight to the destination.
      if (userInfo.accessToken?.trim()) {
        this.cookies.writeTokens(res, {
          accessToken: userInfo.accessToken.trim(),
        });
        const destinationUrl = `${frontendUrl}${
          targetRedirect.startsWith('/') ? targetRedirect : `/${targetRedirect}`
        }`;
        return res.redirect(302, destinationUrl);
      }

      if (this.isConfirmedDifferentUser(req, userInfo)) {
        this.cookies.clearTokens(res);
      }

      // Fallback: Trigger OTP email dispatch through SSO service
      await this.sso.resendOtpByEmail({ email: userInfo.email });

      const otpUrl = `${frontendUrl}/verify-otp?email=${encodeURIComponent(
        userInfo.email,
      )}&redirectPath=${encodeURIComponent(targetRedirect)}`;

      return res.redirect(302, otpUrl);
    } catch (err) {
      this.logger.error('startExchange failed', err);
      return res.redirect(
        302,
        `${frontendUrl}/login?error=invalid_or_expired_code`,
      );
    }
  }

  @Post('verify-origin')
  @UsePipes(bodyPipe)
  @ApiOperation({
    summary: 'Validate a Competition Event exchange code',
    description:
      'Confirms a single-use code from the Event App is valid and returns the associated identity.',
  })
  async verifyOrigin(
    @Body() body: AuthVerifyOriginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userInfo = await this.eventAppClient.validateExchangeCode(body.code);
    let targetRedirect = userInfo.redirectPath || '/dashboard?source=crabonic';
    if (!targetRedirect.includes('source=')) {
      targetRedirect +=
        (targetRedirect.includes('?') ? '&' : '?') + 'source=crabonic';
    }
    if (userInfo.accessToken?.trim()) {
      this.cookies.writeTokens(res, {
        accessToken: userInfo.accessToken.trim(),
      });
    }
    return {
      valid: true,
      email: userInfo.email,
      redirectPath: targetRedirect,
    };
  }

  @Post('login')
  @UsePipes(bodyPipe)
  async login(
    @Body() body: AuthLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const raw = await this.sso.login(body);
    return this.handleAuthResponse(raw, res);
  }

  @Post('signup')
  @UsePipes(bodyPipe)
  async signup(@Body() body: AuthSignupDto) {
    return this.sso.signUp(body);
  }

  @Post('refresh')
  @HttpCode(204)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = this.cookies.readRefreshToken(req);
    if (!refreshToken) {
      throw new UnauthorizedException({
        statusCode: 401,
        error: 'MissingRefreshToken',
        message: 'Missing refresh token cookie',
      });
    }
    const raw = await this.sso.refresh({ refreshToken });
    const tokens = extractAuthCookieTokens(raw);
    if (!tokens?.accessToken) {
      throw new UnauthorizedException({
        statusCode: 401,
        error: 'RefreshFailed',
        message: 'Refresh did not return an access token',
      });
    }
    this.cookies.writeTokens(res, tokens);
  }

  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response) {
    this.cookies.clearTokens(res);
  }

  @Post('resend-otp')
  @UsePipes(bodyPipe)
  async resendOtp(@Body() body: AuthResendOtpDto) {
    return this.sso.resendOtpByEmail(body);
  }

  @Post('verify-otp')
  @UsePipes(bodyPipe)
  async verifyOtp(
    @Body() body: AuthVerifyOtpDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const raw = await this.sso.verifyOtp(body);
    return this.handleAuthResponse(raw, res);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @UsePipes(bodyPipe)
  async changePassword(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: AuthChangePasswordDto,
  ) {
    const accessToken = req.auth?.accessToken?.trim();
    if (!accessToken) {
      throw new UnauthorizedException({
        statusCode: 401,
        error: 'InvalidToken',
        message: 'Missing or invalid access token',
      });
    }
    const result = await this.sso.changePassword({
      accessToken,
      newPassword: body.newPassword,
    });
    this.cookies.clearTokens(res);
    return result;
  }

  @Get('me')
  @ApiBearerAuth('bearer')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: Request) {
    return { auth: req.auth };
  }

  /**
   * Compares the identity named by a freshly-validated exchange code against
   * whatever session cookie the browser is currently carrying. Only reads the
   * token's claims (no signature check) — this is purely a UX decision about
   * whether to preserve the existing session, not an auth boundary, since
   * establishing a real session always still requires OTP verification
   * against the SSO server via JwtAuthGuard elsewhere.
   *
   * Returns true ONLY when there's positive proof of a different identity
   * (a decodable access token naming someone else). Anything inconclusive —
   * no access token cookie, an undecodable one — returns false, since the
   * access token's TTL is much shorter than the refresh token's and we don't
   * want to treat "access token merely expired" as "different user" and nuke
   * an otherwise-still-valid refresh token over it.
   */
  private isConfirmedDifferentUser(
    req: Request,
    userInfo: { authServerUserId?: string; email?: string },
  ): boolean {
    const token = this.cookies.readAccessToken(req);
    if (!token) return false;

    const claims = this.decodeJwtPayload(token);
    if (!claims) return false;

    const existingUserId = (claims.userid ?? claims.sub)?.toString().trim();
    if (existingUserId && userInfo.authServerUserId) {
      return existingUserId !== userInfo.authServerUserId.trim();
    }

    const existingEmail = claims.email?.toString().trim().toLowerCase();
    if (existingEmail && userInfo.email) {
      return existingEmail !== userInfo.email.trim().toLowerCase();
    }

    return false;
  }

  /**
   * Decodes a JWT's payload segment without verifying its signature. Only
   * used for the same-user UX check above — never for authorization, since
   * `jose`'s remote-JWKS verification (JwtAuthGuard) is what actually gates
   * access, and this decode is intentionally kept dependency-free (jose is
   * ESM-only and awkward to import in this CJS-transformed test suite).
   */
  private decodeJwtPayload(token: string): SsoTokenClaims | null {
    const segment = token.split('.')[1];
    if (!segment) return null;
    try {
      const json = Buffer.from(segment, 'base64url').toString('utf8');
      return JSON.parse(json) as SsoTokenClaims;
    } catch {
      return null;
    }
  }

  private handleAuthResponse(raw: unknown, res: Response) {
    const session = toAuthSessionDto(raw);
    if (session.otpVerified) {
      const tokens = extractAuthCookieTokens(raw);
      if (tokens?.accessToken) {
        this.cookies.writeTokens(res, tokens);
      }
    }
    return session;
  }
}
