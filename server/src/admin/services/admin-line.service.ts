import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LineConnectionService } from '../../line/line-connection.service';
import { LineService } from '../../line/line.service';

@Injectable()
export class AdminLineService {
  constructor(
    private readonly connections: LineConnectionService,
    private readonly line: LineService,
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
        lineUserId: row.lineUserId,
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
        `No LINE connection for user ${userId.trim()}`,
      );
    }

    await this.line.sendText(connection.lineUserId, trimmed);
    return {
      success: true,
      userId: connection.userId,
      lineUserId: connection.lineUserId,
    };
  }
}
