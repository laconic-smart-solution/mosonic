import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
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
import { AuthVerifyOtpDto } from './dto/auth-verify-otp.dto';
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
    private readonly cookies: AuthCookieService,
  ) {}

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
