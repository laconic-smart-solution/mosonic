import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RepositoriesModule } from '../repositories/repositories.module';
import { ApiUsageCoreModule } from '../api-usage/api-usage-core.module';
import { HeygenBillingService } from './heygen-billing.service';

@Module({
  imports: [ConfigModule, ApiUsageCoreModule, RepositoriesModule],
  providers: [HeygenBillingService],
  exports: [HeygenBillingService],
})
export class HeygenBillingModule {}
