import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { normalizeAuthorizeServerAuthBody } from './auth-response.util';
import { AuthChangePasswordDto } from './dto/auth-change-password.dto';
import { AuthLoginDto } from './dto/auth-login.dto';
import { AuthRefreshDto } from './dto/auth-refresh.dto';
import { AuthResendOtpDto } from './dto/auth-resend-otp.dto';
import { AuthSignupDto } from './dto/auth-signup.dto';
import { AuthVerifyOtpDto } from './dto/auth-verify-otp.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { SsoClientService } from './sso-client.service';

function extractBearerToken(authorization: string | undefined): string | null {
  if (!authorization || typeof authorization !== 'string') {
    return null;
  }
  const m = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  const token = m?.[1]?.trim();
  return token || null;
}

const bodyPipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

@Controller('auth')
@ApiTags('Auth')
export class AuthController {
  constructor(private readonly sso: SsoClientService) {}

  @Post('login')
  @UsePipes(bodyPipe)
  async login(@Body() body: AuthLoginDto) {
    const raw = await this.sso.login(body);
    return normalizeAuthorizeServerAuthBody(raw);
  }

  @Post('signup')
  @UsePipes(bodyPipe)
  async signup(@Body() body: AuthSignupDto) {
    return this.sso.signUp(body);
  }

  @Post('refresh')
  @UsePipes(bodyPipe)
  async refresh(@Body() body: AuthRefreshDto) {
    const raw = await this.sso.refresh(body);
    return normalizeAuthorizeServerAuthBody(raw);
  }

  @Post('resend-otp')
  @UsePipes(bodyPipe)
  async resendOtp(@Body() body: AuthResendOtpDto) {
    return this.sso.resendOtpByEmail(body);
  }

  @Post('verify-otp')
  @UsePipes(bodyPipe)
  async verifyOtp(@Body() body: AuthVerifyOtpDto) {
    const raw = await this.sso.verifyOtp(body);
    return normalizeAuthorizeServerAuthBody(raw);
  }

  @Post('change-password')
  @UsePipes(bodyPipe)
  async changePassword(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: AuthChangePasswordDto,
  ) {
    const accessToken = extractBearerToken(authorization);
    if (!accessToken) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }
    return this.sso.changePassword({
      accessToken,
      newPassword: body.newPassword,
    });
  }

  @Get('me')
  @ApiBearerAuth('bearer')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: Request) {
    return { auth: req.auth };
  }
}
