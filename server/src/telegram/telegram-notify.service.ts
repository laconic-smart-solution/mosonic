import { Injectable, Logger } from '@nestjs/common';
import { TelegramConnectionService } from './telegram-connection.service';
import { TelegramService } from './telegram.service';

const MAX_TELEGRAM_TEXT = 4096;

/**
 * Best-effort Telegram push to a Mosonic user when they have linked Telegram.
 * Never throws — notification failures must not break pipelines or billing.
 */
@Injectable()
export class TelegramNotifyService {
  private readonly logger = new Logger(TelegramNotifyService.name);

  constructor(
    private readonly connections: TelegramConnectionService,
    private readonly telegram: TelegramService,
  ) {}

  async notifyUser(
    userId: string | null | undefined,
    text: string,
  ): Promise<void> {
    const id = userId?.trim();
    const msg = text.trim();
    if (!id || !msg) return;

    try {
      const connection = await this.connections.findByUserId(id);
      if (!connection) return;

      await this.telegram.sendText(
        connection.telegramChatId,
        msg.slice(0, MAX_TELEGRAM_TEXT),
      );
    } catch (err) {
      this.logger.warn(
        `Telegram notify failed for user ${id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
