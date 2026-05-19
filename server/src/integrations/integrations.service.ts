import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash, randomBytes } from 'node:crypto';
import { Model } from 'mongoose';
import type { TenancyAuth } from '../auth/tenancy.types';
import { UserRole } from '../users/schemas/user.schema';
import { OrchestrationService } from '../orchestration/orchestration.service';
import {
  IntegrationApiKey,
  type IntegrationApiKeyDocument,
} from './schemas/integration-api-key.schema';
import {
  WebhookSubscription,
  type WebhookSubscriptionDocument,
} from './schemas/webhook-subscription.schema';

@Injectable()
export class IntegrationsService {
  constructor(
    @InjectModel(IntegrationApiKey.name)
    private readonly apiKeyModel: Model<IntegrationApiKeyDocument>,
    @InjectModel(WebhookSubscription.name)
    private readonly subscriptionModel: Model<WebhookSubscriptionDocument>,
    private readonly orchestration: OrchestrationService,
  ) {}

  async createApiKey(userId: string, name: string, scopes?: string[]) {
    const raw = `ntx_${randomBytes(24).toString('hex')}`;
    const keyHash = createHash('sha256').update(raw).digest('hex');
    const doc = await this.apiKeyModel.create({
      userId,
      name: name.trim(),
      keyHash,
      scopes: scopes?.length ? scopes : ['pipeline:start'],
    });
    return { keyId: doc.keyId, apiKey: raw, scopes: doc.scopes };
  }

  async validateApiKey(rawKey: string): Promise<IntegrationApiKeyDocument | null> {
    const keyHash = createHash('sha256').update(rawKey.trim()).digest('hex');
    return this.apiKeyModel.findOne({ keyHash, enabled: true }).exec();
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
    const doc = await this.subscriptionModel.create({
      userId: auth.userId,
      url: body.url.trim(),
      secret,
      events: body.events,
    });
    return { subscriptionId: doc.subscriptionId, secret };
  }
}
