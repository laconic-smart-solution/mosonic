import { Injectable, Logger } from '@nestjs/common';
import { WechatConnectionService } from './wechat-connection.service';
import { WechatService } from './wechat.service';

/** WeChat customer-service text messages are capped at 2048 chars. */
const MAX_WECHAT_TEXT = 2048;

/**
 * Best-effort WeChat push to a Mosonic user when they have linked WeChat OA.
 * Never throws — notification failures must not break pipelines or billing.
 */
@Injectable()
export class WechatNotifyService {
  private readonly logger = new Logger(WechatNotifyService.name);

  constructor(
    private readonly connections: WechatConnectionService,
    private readonly wechat: WechatService,
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

      await this.wechat.sendText(
        connection.wechatOpenId,
        msg.slice(0, MAX_WECHAT_TEXT),
      );
    } catch (err) {
      this.logger.warn(
        `WeChat notify failed for user ${id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
