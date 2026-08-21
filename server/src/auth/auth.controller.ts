import {
  Body,
  Controller,
  Get,
  HttpCode,
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
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import {
  extractAuthCookieTokens,
  toAuthSessionDto,
} from './auth-response.util';
import { AuthCookieService } from './auth-cookie.service';
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
  @ApiQuery({ name: 'code', required: true, description: 'Single-use exchange code' })
  @ApiQuery({ name: 'redirect_path', required: false, description: 'Destination redirect path' })
  async startExchange(
    @Query('code') code: string,
    @Query('redirect_path') redirectPath: string | undefined,
    @Res() res: Response,
  ) {
    const frontendUrl =
      this.config.get<string>('FRONTEND_URL')?.trim().replace(/\/$/, '') ||
      'http://localhost:5173';

    try {
      const userInfo = await this.eventAppClient.validateExchangeCode(code);
      // Trigger OTP email dispatch through SSO service
      await this.sso.resendOtpByEmail({ email: userInfo.email });

      const targetRedirect =
        redirectPath || userInfo.redirectPath || '/dashboard';
      const otpUrl = `${frontendUrl}/auth/otp?email=${encodeURIComponent(
        userInfo.email,
      )}&redirectPath=${encodeURIComponent(targetRedirect)}`;

      return res.redirect(302, otpUrl);
    } catch {
      return res.redirect(
        302,
        `${frontendUrl}/auth/login?error=invalid_or_expired_code`,
      );
    }
  }

  @Post('verify-origin')
  @UsePipes(bodyPipe)
  @ApiOperation({
    summary: 'Validate a Competition Event exchange code',
    description:
      'Confirms a single-use code from the Event App is valid and returns the associated identity. Does not establish a session — the /verify-origin page uses this only to confirm the referral, then checks the existing cookie session via GET /auth/me.',
  })
  async verifyOrigin(@Body() body: AuthVerifyOriginDto) {
    const userInfo = await this.eventAppClient.validateExchangeCode(
      body.code,
    );
    return {
      valid: true,
      email: userInfo.email,
      redirectPath: userInfo.redirectPath ?? null,
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
