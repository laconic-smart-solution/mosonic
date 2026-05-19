import { OutboundWebhookService } from './outbound-webhook.service';

describe('OutboundWebhookService', () => {
  it('does not throw when no subscriptions match', async () => {
    const subscriptionModel = {
      find: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }),
    };
    const deliveryModel = { create: jest.fn() };
    const service = new OutboundWebhookService(
      subscriptionModel as never,
      deliveryModel as never,
    );
    await expect(
      service.emit('user-1', 'pipeline.completed', { pipelineId: 'p1' }),
    ).resolves.toBeUndefined();
  });
});
