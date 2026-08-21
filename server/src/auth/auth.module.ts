import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthCookieService } from './auth-cookie.service';
import { SsoClientService } from './sso-client.service';
import { EventAppClientService } from './event-app-client.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AdminGuard } from './admin.guard';
import { WsAuthService } from './ws-auth.service';
import { UsersModule } from '../users/users.module';

@Global()
@Module({
  imports: [UsersModule],
  controllers: [AuthController],
  providers: [
    SsoClientService,
    EventAppClientService,
    AuthCookieService,
    JwtAuthGuard,
    AdminGuard,
    WsAuthService,
  ],
  exports: [
    SsoClientService,
    EventAppClientService,
    AuthCookieService,
    JwtAuthGuard,
    AdminGuard,
    WsAuthService,
    UsersModule,
  ],
})
export class AuthModule {}
