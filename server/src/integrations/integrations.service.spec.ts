jest.mock('../orchestration/orchestration.service', () => ({
  OrchestrationService: class OrchestrationService {},
}));

import { UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { IIntegrationApiKeyRepository } from '../repositories/interfaces/integration-api-key.repository.interface';
import type { IWebhookSubscriptionRepository } from '../repositories/interfaces/webhook-subscription.repository.interface';
import {
  COMPETITION_EVENT_API_SCOPE,
  IntegrationsService,
  PIPELINE_START_API_SCOPE,
} from './integrations.service';

describe('IntegrationsService', () => {
  const apiKeys: jest.Mocked<IIntegrationApiKeyRepository> = {
    create: jest.fn(),
    findEnabledByKeyHash: jest.fn(),
  };
  const subscriptions: jest.Mocked<IWebhookSubscriptionRepository> = {
    create: jest.fn(),
    findActiveForEvent: jest.fn(),
  };
  const orchestration = { startPipeline: jest.fn() };
  const service = new IntegrationsService(
    apiKeys,
    subscriptions,
    orchestration as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects invalid API key', async () => {
    apiKeys.findEnabledByKeyHash.mockResolvedValue(null);
    await expect(
      service.startPipelineViaApiKey('ntx_bad', {
        workflowId: 'w1',
        ruleId: 'r1',
        contentPrompt: 'hello',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('starts pipeline with valid scoped key', async () => {
    const raw = 'ntx_testkey';
    apiKeys.findEnabledByKeyHash.mockResolvedValue({
      keyId: 'k1',
      userId: 'u1',
      name: 'pipeline',
      keyHash: createHash('sha256').update(raw).digest('hex'),
      scopes: [PIPELINE_START_API_SCOPE],
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    orchestration.startPipeline.mockResolvedValue({ pipelineId: 'p1' });
    const result = await service.startPipelineViaApiKey(raw, {
      workflowId: 'w1',
      ruleId: 'r1',
      contentPrompt: 'hello',
    });
    expect(result).toEqual({ pipelineId: 'p1' });
    expect(orchestration.startPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { source: 'integration' },
      }),
    );
  });

  it('creates a key with competition-event scope when requested', async () => {
    apiKeys.create.mockResolvedValue({
      keyId: 'k2',
      userId: 'u1',
      name: 'competition-event',
      keyHash: 'hash',
      scopes: [COMPETITION_EVENT_API_SCOPE],
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const result = await service.createApiKey('u1', 'competition-event', [
      COMPETITION_EVENT_API_SCOPE,
    ]);
    expect(result.scopes).toEqual([COMPETITION_EVENT_API_SCOPE]);
    expect(result.apiKey).toMatch(/^ntx_/);
    expect(apiKeys.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        scopes: [COMPETITION_EVENT_API_SCOPE],
      }),
    );
  });
});
