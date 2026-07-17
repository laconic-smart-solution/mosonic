import { Injectable, Logger } from '@nestjs/common';
import { LineConnectionService } from './line-connection.service';
import { LineService } from './line.service';

const MAX_LINE_TEXT = 5000;

/**
 * Best-effort LINE push to a Mosonic user when they have linked LINE.
 * Never throws — notification failures must not break pipelines or billing.
 */
@Injectable()
export class LineNotifyService {
  private readonly logger = new Logger(LineNotifyService.name);

  constructor(
    private readonly connections: LineConnectionService,
    private readonly line: LineService,
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

      await this.line.sendText(
        connection.lineUserId,
        msg.slice(0, MAX_LINE_TEXT),
      );
    } catch (err) {
      this.logger.warn(
        `LINE notify failed for user ${id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
