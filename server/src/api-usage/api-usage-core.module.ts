import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ApiProviderBillingSettingsService } from './api-provider-billing-settings.service';

@Module({
  imports: [DatabaseModule],
  providers: [ApiProviderBillingSettingsService],
  exports: [ApiProviderBillingSettingsService],
})
export class ApiUsageCoreModule {}
