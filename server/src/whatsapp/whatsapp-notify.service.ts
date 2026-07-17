import { Injectable, Logger } from '@nestjs/common';
import { WhatsAppConnectionService } from './whatsapp-connection.service';
import { WhatsAppService } from './whatsapp.service';

const MAX_WHATSAPP_TEXT = 4096;

/**
 * Best-effort WhatsApp push to a Mosonic user when they have linked WhatsApp.
 * Never throws — notification failures must not break pipelines or billing.
 */
@Injectable()
export class WhatsAppNotifyService {
  private readonly logger = new Logger(WhatsAppNotifyService.name);

  constructor(
    private readonly connections: WhatsAppConnectionService,
    private readonly whatsapp: WhatsAppService,
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

      await this.whatsapp.sendText(
        connection.whatsappWaId,
        msg.slice(0, MAX_WHATSAPP_TEXT),
      );
    } catch (err) {
      this.logger.warn(
        `WhatsApp notify failed for user ${id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
