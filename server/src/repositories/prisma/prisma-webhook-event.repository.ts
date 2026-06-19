import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { isUniqueViolation } from './prisma.util';
import type { IWebhookEventRepository } from '../interfaces/webhook-event.repository.interface';

@Injectable()
export class PrismaWebhookEventRepository implements IWebhookEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  async tryRecord(
    eventId: string,
    event: string,
    processedAt: Date,
  ): Promise<'created' | 'duplicate'> {
    try {
      await this.prisma.webhookEvent.create({
        data: { eventId, event, processedAt },
      });
      return 'created';
    } catch (err) {
      if (isUniqueViolation(err)) return 'duplicate';
      throw err;
    }
  }
}
