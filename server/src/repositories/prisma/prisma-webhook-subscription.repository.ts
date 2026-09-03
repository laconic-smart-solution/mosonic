import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type {
  IWebhookSubscriptionRepository,
  WebhookSubscriptionRecord,
} from '../interfaces/webhook-subscription.repository.interface';

@Injectable()
export class PrismaWebhookSubscriptionRepository implements IWebhookSubscriptionRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    data: Prisma.WebhookSubscriptionCreateInput,
  ): Promise<WebhookSubscriptionRecord> {
    return this.prisma.webhookSubscription.create({ data });
  }

  findActiveForEvent(
    userId: string,
    event: string,
  ): Promise<WebhookSubscriptionRecord[]> {
    return this.prisma.webhookSubscription.findMany({
      where: { userId, enabled: true, events: { has: event } },
    });
  }
}
