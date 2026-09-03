import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type {
  IWebhookDeliveryRepository,
  WebhookDeliveryRecord,
} from '../interfaces/webhook-delivery.repository.interface';

@Injectable()
export class PrismaWebhookDeliveryRepository implements IWebhookDeliveryRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    data: Prisma.WebhookDeliveryCreateInput,
  ): Promise<WebhookDeliveryRecord> {
    return this.prisma.webhookDelivery.create({ data });
  }

  save(delivery: WebhookDeliveryRecord): Promise<WebhookDeliveryRecord> {
    return this.prisma.webhookDelivery.update({
      where: { deliveryId: delivery.deliveryId },
      data: {
        attempts: delivery.attempts,
        lastStatusCode: delivery.lastStatusCode,
        lastError: delivery.lastError,
        deliveredAt: delivery.deliveredAt,
      },
    });
  }
}
