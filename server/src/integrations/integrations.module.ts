import { forwardRef, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrchestrationModule } from '../orchestration/orchestration.module';
import { RepositoriesModule } from '../repositories/repositories.module';
import { IntegrationsV1Controller } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { OutboundWebhookService } from './outbound-webhook.service';

@Module({
  imports: [
    AuthModule,
    RepositoriesModule,
    forwardRef(() => OrchestrationModule),
  ],
  controllers: [IntegrationsV1Controller],
  providers: [IntegrationsService, OutboundWebhookService],
  exports: [OutboundWebhookService, IntegrationsService],
})
export class IntegrationsModule {}
