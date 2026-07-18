import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TelegramConnectionService } from '../../telegram/telegram-connection.service';
import { TelegramService } from '../../telegram/telegram.service';

@Injectable()
export class AdminTelegramService {
  constructor(
    private readonly connections: TelegramConnectionService,
    private readonly telegram: TelegramService,
  ) {}

  async listConnections(args: {
    page: number;
    limit: number;
    search?: string;
  }) {
    const page = Math.max(1, args.page);
    const limit = Math.min(100, Math.max(1, args.limit));
    const { rows, total } = await this.connections.listForAdmin({
      page,
      limit,
      search: args.search,
    });
    return {
      connections: rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        telegramChatId: row.telegramChatId,
        connectedAt: row.connectedAt.toISOString(),
        email: row.email,
        username: row.username,
        firstName: row.firstName,
        lastName: row.lastName,
        displayName:
          [row.firstName, row.lastName].filter(Boolean).join(' ').trim() ||
          row.username ||
          row.email ||
          row.userId,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 0,
    };
  }

  async sendMessageToUser(userId: string, text: string) {
    const trimmed = text.trim();
    if (!trimmed) {
      throw new BadRequestException('Message text is required');
    }

    const connection = await this.connections.findByUserId(userId);
    if (!connection) {
      throw new NotFoundException(
        `No Telegram connection for user ${userId.trim()}`,
      );
    }

    await this.telegram.sendText(connection.telegramChatId, trimmed);
    return {
      success: true,
      userId: connection.userId,
      telegramChatId: connection.telegramChatId,
    };
  }

  async announce(text: string) {
    const trimmed = text.trim();
    if (!trimmed) {
      throw new BadRequestException('Message text is required');
    }

    const recipientIds = await this.connections.listAllTelegramChatIds();
    if (recipientIds.length === 0) {
      return {
        success: true,
        total: 0,
        sent: 0,
        failed: 0,
        chunkCount: 0,
        failedRecipientIds: [] as string[],
      };
    }

    const result = await this.telegram.sendBatchText(recipientIds, trimmed);
    return {
      success: true,
      ...result,
    };
  }
}
