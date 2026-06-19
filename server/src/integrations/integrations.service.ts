import {
  BadRequestException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { TenancyAuth } from '../auth/tenancy.types';
import { UserRole } from '../users/schemas/user.schema';
import { OrchestrationService } from '../orchestration/orchestration.service';
import type { IIntegrationApiKeyRepository } from '../repositories/interfaces/integration-api-key.repository.interface';
import type { IWebhookSubscriptionRepository } from '../repositories/interfaces/webhook-subscription.repository.interface';
import type { IntegrationApiKeyRecord } from '../repositories/interfaces/integration-api-key.repository.interface';
import {
  INTEGRATION_API_KEY_REPOSITORY,
  WEBHOOK_SUBSCRIPTION_REPOSITORY,
} from '../repositories/tokens';

@Injectable()
export class IntegrationsService {
  constructor(
    @Inject(INTEGRATION_API_KEY_REPOSITORY)
    private readonly apiKeys: IIntegrationApiKeyRepository,
    @Inject(WEBHOOK_SUBSCRIPTION_REPOSITORY)
    private readonly subscriptions: IWebhookSubscriptionRepository,
    private readonly orchestration: OrchestrationService,
  ) {}

  async createApiKey(userId: string, name: string, scopes?: string[]) {
    const raw = `ntx_${randomBytes(24).toString('hex')}`;
    const keyHash = createHash('sha256').update(raw).digest('hex');
    const doc = await this.apiKeys.create({
      userId,
      name: name.trim(),
      keyHash,
      scopes: scopes?.length ? scopes : ['pipeline:start'],
    });
    return { keyId: doc.keyId, apiKey: raw, scopes: doc.scopes };
  }

  async validateApiKey(
    rawKey: string,
  ): Promise<IntegrationApiKeyRecord | null> {
    const keyHash = createHash('sha256').update(rawKey.trim()).digest('hex');
    return this.apiKeys.findEnabledByKeyHash(keyHash);
  }

  async startPipelineViaApiKey(
    rawKey: string,
    body: { workflowId: string; ruleId: string; contentPrompt: string },
  ) {
    const key = await this.validateApiKey(rawKey);
    if (!key) {
      throw new UnauthorizedException('Invalid API key');
    }
    if (!key.scopes.includes('pipeline:start')) {
      throw new BadRequestException('API key missing pipeline:start scope');
    }
    const auth: TenancyAuth = { userId: key.userId, role: UserRole.CUSTOMER };
    return this.orchestration.startPipeline({
      workflowId: body.workflowId,
      ruleId: body.ruleId,
      contentPrompt: body.contentPrompt,
      auth,
      metadata: { source: 'integration' },
    });
  }

  async subscribeWebhook(
    auth: TenancyAuth,
    body: { url: string; events: string[]; secret?: string },
  ) {
    const secret = body.secret?.trim() || randomBytes(16).toString('hex');
    const doc = await this.subscriptions.create({
      userId: auth.userId,
      url: body.url.trim(),
      secret,
      events: body.events,
    });
    return { subscriptionId: doc.subscriptionId, secret };
  }
}
