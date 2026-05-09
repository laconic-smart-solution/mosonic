import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthLoginDto } from './dto/auth-login.dto';
import { AuthRefreshDto } from './dto/auth-refresh.dto';
import { AuthSignupDto } from './dto/auth-signup.dto';
import { SsoClientService } from './sso-client.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { UseGuards } from '@nestjs/common';

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
    return this.sso.login(body);
  }

  @Post('signup')
  @UsePipes(bodyPipe)
  async signup(@Body() body: AuthSignupDto) {
    return this.sso.signUp(body);
  }

  @Post('refresh')
  @UsePipes(bodyPipe)
  async refresh(@Body() body: AuthRefreshDto) {
    return this.sso.refresh(body);
  }

  @Get('me')
  @ApiBearerAuth('bearer')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: Request) {
    return { auth: req.auth };
  }
}
