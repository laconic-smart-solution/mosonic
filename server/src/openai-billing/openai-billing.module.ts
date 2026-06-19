import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ApiUsageCoreModule } from '../api-usage/api-usage-core.module';
import { OpenAiBillingService } from './openai-billing.service';

@Module({
  imports: [ConfigModule, ApiUsageCoreModule],
  providers: [OpenAiBillingService],
  exports: [OpenAiBillingService],
})
export class OpenAiBillingModule {}
