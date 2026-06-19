import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RepositoriesModule } from '../repositories/repositories.module';
import { UsersModule } from '../users/users.module';
import { ApiUsageCoreModule } from '../api-usage/api-usage-core.module';
import { ZernioBillingService } from './zernio-billing.service';

@Module({
  imports: [ConfigModule, ApiUsageCoreModule, RepositoriesModule, UsersModule],
  providers: [ZernioBillingService],
  exports: [ZernioBillingService],
})
export class ZernioBillingModule {}
