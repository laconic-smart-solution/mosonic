import { OutboundWebhookService } from './outbound-webhook.service';

describe('OutboundWebhookService', () => {
  it('does not throw when no subscriptions match', async () => {
    const subscriptionRepo = {
      findActiveForEvent: jest.fn().mockResolvedValue([]),
    };
    const deliveryRepo = { create: jest.fn() };
    const service = new OutboundWebhookService(
      subscriptionRepo as never,
      deliveryRepo as never,
    );
    await expect(
      service.emit('user-1', 'pipeline.completed', { pipelineId: 'p1' }),
    ).resolves.toBeUndefined();
  });
});
