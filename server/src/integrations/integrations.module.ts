import { forwardRef, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ContentModule } from '../content/content.module';
import { LlmModule } from '../llm/llm.module';
import { OrchestrationModule } from '../orchestration/orchestration.module';
import { RepositoriesModule } from '../repositories/repositories.module';
import { UsersModule } from '../users/users.module';
import { ApiKeyOrJwtGuard } from './api-key-or-jwt.guard';
import { CompetitionEventIntegrationController } from './competition-event-integration.controller';
import { CompetitionEventIntegrationService } from './competition-event-integration.service';
import { IntegrationsV1Controller } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { OutboundWebhookService } from './outbound-webhook.service';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    forwardRef(() => ContentModule),
    LlmModule,
    RepositoriesModule,
    forwardRef(() => OrchestrationModule),
  ],
  controllers: [
    IntegrationsV1Controller,
    CompetitionEventIntegrationController,
  ],
  providers: [
    IntegrationsService,
    ApiKeyOrJwtGuard,
    OutboundWebhookService,
    CompetitionEventIntegrationService,
  ],
  exports: [OutboundWebhookService, IntegrationsService, ApiKeyOrJwtGuard],
})
export class IntegrationsModule {}
