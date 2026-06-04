jest.mock('../orchestration/orchestration.service', () => ({
  OrchestrationService: class OrchestrationService {
    startPipeline = jest.fn();
  },
}));

import { UnauthorizedException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { createHash } from 'node:crypto';
import { IntegrationsService } from './integrations.service';
import { IntegrationApiKey } from './schemas/integration-api-key.schema';
import { WebhookSubscription } from './schemas/webhook-subscription.schema';
import { OrchestrationService } from '../orchestration/orchestration.service';

describe('IntegrationsService', () => {
  let service: IntegrationsService;
  const apiKeyModel = {
    create: jest.fn(),
    findOne: jest.fn(),
  };
  const subscriptionModel = { create: jest.fn() };
  const orchestration = { startPipeline: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        IntegrationsService,
        { provide: getModelToken(IntegrationApiKey.name), useValue: apiKeyModel },
        {
          provide: getModelToken(WebhookSubscription.name),
          useValue: subscriptionModel,
        },
        { provide: OrchestrationService, useValue: orchestration },
      ],
    }).compile();
    service = moduleRef.get(IntegrationsService);
  });

  it('rejects invalid API key', async () => {
    apiKeyModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
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
    const keyHash = createHash('sha256').update(raw).digest('hex');
    apiKeyModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        userId: 'u1',
        scopes: ['pipeline:start'],
        enabled: true,
        keyHash,
      }),
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
});
