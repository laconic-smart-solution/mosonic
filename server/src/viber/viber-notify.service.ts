import { Injectable, Logger } from '@nestjs/common';
import { ViberConnectionService } from './viber-connection.service';
import { ViberService } from './viber.service';

const MAX_VIBER_TEXT = 4096;

/**
 * Best-effort Viber push to a Mosonic user when they have linked Viber.
 * Never throws — notification failures must not break pipelines or billing.
 */
@Injectable()
export class ViberNotifyService {
  private readonly logger = new Logger(ViberNotifyService.name);

  constructor(
    private readonly connections: ViberConnectionService,
    private readonly viber: ViberService,
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

      await this.viber.sendText(
        connection.viberUserId,
        msg.slice(0, MAX_VIBER_TEXT),
      );
    } catch (err) {
      this.logger.warn(
        `Viber notify failed for user ${id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
