import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { createHmac } from 'node:crypto';
import type { IWebhookDeliveryRepository } from '../repositories/interfaces/webhook-delivery.repository.interface';
import type { IWebhookSubscriptionRepository } from '../repositories/interfaces/webhook-subscription.repository.interface';
import type { WebhookSubscriptionRecord } from '../repositories/interfaces/webhook-subscription.repository.interface';
import {
  WEBHOOK_DELIVERY_REPOSITORY,
  WEBHOOK_SUBSCRIPTION_REPOSITORY,
} from '../repositories/tokens';

@Injectable()
export class OutboundWebhookService {
  private readonly logger = new Logger(OutboundWebhookService.name);

  constructor(
    @Inject(WEBHOOK_SUBSCRIPTION_REPOSITORY)
    private readonly subscriptions: IWebhookSubscriptionRepository,
    @Inject(WEBHOOK_DELIVERY_REPOSITORY)
    private readonly deliveries: IWebhookDeliveryRepository,
  ) {}

  async emit(userId: string, event: string, payload: Record<string, unknown>) {
    const subs = await this.subscriptions.findActiveForEvent(userId, event);
    for (const sub of subs) {
      void this.deliverWithRetry(sub, event, payload);
    }
  }

  private async deliverWithRetry(
    sub: WebhookSubscriptionRecord,
    event: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    let delivery = await this.deliveries.create({
      subscription: { connect: { subscriptionId: sub.subscriptionId } },
      event,
      payload: payload as Prisma.InputJsonValue,
      attempts: 0,
    });

    const body = JSON.stringify({ event, payload, subscriptionId: sub.subscriptionId });
    const signature = createHmac('sha256', sub.secret).update(body).digest('hex');

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const res = await fetch(sub.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-NeutralTex-Event': event,
            'X-NeutralTex-Signature': signature,
          },
          body,
        });
        delivery.attempts = attempt;
        delivery.lastStatusCode = res.status;
        if (res.ok) {
          delivery.deliveredAt = new Date();
          delivery.lastError = null;
          await this.deliveries.save(delivery);
          return;
        }
        delivery.lastError = `HTTP ${res.status}`;
      } catch (err) {
        delivery.attempts = attempt;
        delivery.lastError = err instanceof Error ? err.message : String(err);
      }
      await this.deliveries.save(delivery);
      await new Promise((r) => setTimeout(r, attempt * 1000));
    }
    this.logger.warn(
      `Webhook delivery failed for ${sub.subscriptionId} event ${event}`,
    );
  }
}
