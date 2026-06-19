import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ZernioClient } from '../mcp/zernio/zernio.client';
import { RepositoriesModule } from '../repositories/repositories.module';
import { UsersModule } from '../users/users.module';
import { ZernioBillingService } from './zernio-billing.service';

@Module({
  imports: [ConfigModule, RepositoriesModule, UsersModule],
  providers: [ZernioClient, ZernioBillingService],
  exports: [ZernioBillingService],
})
export class ZernioBillingModule {}
