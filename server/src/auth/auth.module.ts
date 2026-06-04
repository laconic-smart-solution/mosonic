import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { SsoClientService } from './sso-client.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AdminGuard } from './admin.guard';
import { WsAuthService } from './ws-auth.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [UsersModule],
  controllers: [AuthController],
  providers: [SsoClientService, JwtAuthGuard, AdminGuard, WsAuthService],
  exports: [
    SsoClientService,
    JwtAuthGuard,
    AdminGuard,
    WsAuthService,
    UsersModule,
  ],
})
export class AuthModule {}
