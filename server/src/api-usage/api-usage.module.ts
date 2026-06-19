import { Module } from '@nestjs/common';
import { HeygenBillingModule } from '../heygen-billing/heygen-billing.module';
import { OpenAiBillingModule } from '../openai-billing/openai-billing.module';
import { ZernioBillingModule } from '../zernio-billing/zernio-billing.module';
import { ApiUsageService } from './api-usage.service';

@Module({
  imports: [OpenAiBillingModule, HeygenBillingModule, ZernioBillingModule],
  providers: [ApiUsageService],
  exports: [ApiUsageService],
})
export class ApiUsageModule {}
