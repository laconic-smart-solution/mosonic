import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { SsoClientService } from './sso-client.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AdminGuard } from './admin.guard';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [UsersModule],
  controllers: [AuthController],
  providers: [SsoClientService, JwtAuthGuard, AdminGuard],
  exports: [SsoClientService, JwtAuthGuard, AdminGuard],
})
export class AuthModule {}
