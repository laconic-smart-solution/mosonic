import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHmac } from 'node:crypto';
import { Model } from 'mongoose';
import {
  WebhookDelivery,
  WebhookSubscription,
  type WebhookDeliveryDocument,
  type WebhookSubscriptionDocument,
} from './schemas/webhook-subscription.schema';

@Injectable()
export class OutboundWebhookService {
  private readonly logger = new Logger(OutboundWebhookService.name);

  constructor(
    @InjectModel(WebhookSubscription.name)
    private readonly subscriptionModel: Model<WebhookSubscriptionDocument>,
    @InjectModel(WebhookDelivery.name)
    private readonly deliveryModel: Model<WebhookDeliveryDocument>,
  ) {}

  async emit(userId: string, event: string, payload: Record<string, unknown>) {
    const subs = await this.subscriptionModel
      .find({ userId, enabled: true, events: event })
      .exec();
    for (const sub of subs) {
      void this.deliverWithRetry(sub, event, payload);
    }
  }

  private async deliverWithRetry(
    sub: WebhookSubscriptionDocument,
    event: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const delivery = await this.deliveryModel.create({
      subscriptionId: sub.subscriptionId,
      event,
      payload,
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
          await delivery.save();
          return;
        }
        delivery.lastError = `HTTP ${res.status}`;
      } catch (err) {
        delivery.attempts = attempt;
        delivery.lastError = err instanceof Error ? err.message : String(err);
      }
      await delivery.save();
      await new Promise((r) => setTimeout(r, attempt * 1000));
    }
    this.logger.warn(
      `Webhook delivery failed for ${sub.subscriptionId} event ${event}`,
    );
  }
}
