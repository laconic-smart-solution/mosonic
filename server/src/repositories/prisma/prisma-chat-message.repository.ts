import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type {
  ChatMessagePage,
  ChatMessageRecord,
  IChatMessageRepository,
} from '../interfaces/chat-message.repository.interface';

@Injectable()
export class PrismaChatMessageRepository implements IChatMessageRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findBySessionId(
    sessionId: string,
    limit = 20,
  ): Promise<ChatMessageRecord[]> {
    const rows = await this.prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.reverse();
  }

  async findPageBySessionId(
    sessionId: string,
    { before, limit }: { before?: string; limit: number },
  ): Promise<ChatMessagePage> {
    let where: Prisma.ChatMessageWhereInput = { sessionId };
    if (before) {
      const cursor = await this.prisma.chatMessage.findFirst({
        where: { messageId: before, sessionId },
        select: { messageId: true, createdAt: true },
      });
      if (!cursor) return { messages: [], hasMore: false, nextCursor: null };
      where = {
        sessionId,
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, messageId: { lt: cursor.messageId } },
        ],
      };
    }
    // Uses the (sessionId, createdAt) index; one extra row tells us whether older ones exist.
    const rows = await this.prisma.chatMessage.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { messageId: 'desc' }],
      take: limit + 1,
      // Server-only session state never goes to the client.
      omit: { state: true },
    });
    const hasMore = rows.length > limit;
    const page = (hasMore ? rows.slice(0, limit) : rows).reverse();
    return {
      messages: page,
      hasMore,
      nextCursor: hasMore && page.length > 0 ? page[0].messageId : null,
    };
  }

  create(data: Prisma.ChatMessageCreateInput): Promise<ChatMessageRecord> {
    // The result is emitted/returned to the client: leave the server-only state out.
    return this.prisma.chatMessage.create({ data, omit: { state: true } });
  }
}
