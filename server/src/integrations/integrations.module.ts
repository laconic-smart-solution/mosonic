import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { OrchestrationModule } from '../orchestration/orchestration.module';
import { IntegrationsV1Controller } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { OutboundWebhookService } from './outbound-webhook.service';
import {
  IntegrationApiKey,
  IntegrationApiKeySchema,
} from './schemas/integration-api-key.schema';
import {
  WebhookDelivery,
  WebhookDeliverySchema,
  WebhookSubscription,
  WebhookSubscriptionSchema,
} from './schemas/webhook-subscription.schema';

@Module({
  imports: [
    AuthModule,
    forwardRef(() => OrchestrationModule),
    MongooseModule.forFeature([
      { name: IntegrationApiKey.name, schema: IntegrationApiKeySchema },
      { name: WebhookSubscription.name, schema: WebhookSubscriptionSchema },
      { name: WebhookDelivery.name, schema: WebhookDeliverySchema },
    ]),
  ],
  controllers: [IntegrationsV1Controller],
  providers: [IntegrationsService, OutboundWebhookService],
  exports: [OutboundWebhookService, IntegrationsService],
})
export class IntegrationsModule {}
