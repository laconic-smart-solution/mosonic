import type { Prisma } from '@prisma/client';
import type { WebhookSubscription } from '@prisma/client';

export type WebhookSubscriptionRecord = WebhookSubscription;

export interface IWebhookSubscriptionRepository {
  create(
    data: Prisma.WebhookSubscriptionCreateInput,
  ): Promise<WebhookSubscriptionRecord>;
  findActiveForEvent(
    userId: string,
    event: string,
  ): Promise<WebhookSubscriptionRecord[]>;
}
