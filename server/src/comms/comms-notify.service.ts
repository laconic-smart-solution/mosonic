import { Injectable } from '@nestjs/common';
import { LineNotifyService } from '../line/line-notify.service';
import { TelegramNotifyService } from '../telegram/telegram-notify.service';
import { ViberNotifyService } from '../viber/viber-notify.service';
import { WhatsAppNotifyService } from '../whatsapp/whatsapp-notify.service';

/**
 * Fan-out to connected messaging channels (LINE, Telegram, Viber, and/or WhatsApp).
 * Each channel no-ops if the user has not linked that account.
 */
@Injectable()
export class CommsNotifyService {
  constructor(
    private readonly lineNotify: LineNotifyService,
    private readonly telegramNotify: TelegramNotifyService,
    private readonly viberNotify: ViberNotifyService,
    private readonly whatsappNotify: WhatsAppNotifyService,
  ) {}

  async notifyUser(
    userId: string | null | undefined,
    text: string,
  ): Promise<void> {
    await Promise.all([
      this.lineNotify.notifyUser(userId, text),
      this.telegramNotify.notifyUser(userId, text),
      this.viberNotify.notifyUser(userId, text),
      this.whatsappNotify.notifyUser(userId, text),
    ]);
  }
}
