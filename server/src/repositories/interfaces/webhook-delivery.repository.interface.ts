import type { Prisma } from '@prisma/client';
import type { WebhookDelivery } from '@prisma/client';

export type WebhookDeliveryRecord = WebhookDelivery;

export interface IWebhookDeliveryRepository {
  create(
    data: Prisma.WebhookDeliveryCreateInput,
  ): Promise<WebhookDeliveryRecord>;
  save(delivery: WebhookDeliveryRecord): Promise<WebhookDeliveryRecord>;
}
