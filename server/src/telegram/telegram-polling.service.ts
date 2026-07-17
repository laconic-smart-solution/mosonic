import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramService } from './telegram.service';

/**
 * Local/dev inbound path: Telegram cannot reach localhost webhooks, so Nest
 * long-polls getUpdates. Production should set TELEGRAM_WEBHOOK_URL (HTTPS)
 * and TELEGRAM_POLLING=false.
 */
@Injectable()
export class TelegramPollingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramPollingService.name);
  private running = false;
  private loopPromise: Promise<void> | null = null;
  private offset = 0;

  constructor(
    private readonly config: ConfigService,
    private readonly telegram: TelegramService,
  ) {}

  async onModuleInit(): Promise<void> {
    const polling =
      this.config.get<string>('TELEGRAM_POLLING')?.trim().toLowerCase() ===
      'true';
    const webhookUrl = this.config.get<string>('TELEGRAM_WEBHOOK_URL')?.trim();

    if (!polling && webhookUrl) {
      try {
        await this.telegram.setWebhook(webhookUrl);
        this.logger.log(`Telegram webhook registered: ${webhookUrl}`);
      } catch (err) {
        this.logger.error(
          `Failed to set Telegram webhook: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
      return;
    }

    if (!polling) {
      this.logger.warn(
        'Telegram inbound disabled: set TELEGRAM_POLLING=true (local) or TELEGRAM_WEBHOOK_URL (HTTPS). ' +
          'Without one of these, CONNECT messages never reach Nest.',
      );
      return;
    }

    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN')?.trim();
    if (!token) {
      this.logger.warn('TELEGRAM_POLLING=true but TELEGRAM_BOT_TOKEN is empty');
      return;
    }

    try {
      await this.telegram.deleteWebhook();
    } catch (err) {
      this.logger.warn(
        `deleteWebhook before polling failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    this.running = true;
    this.loopPromise = this.pollLoop();
    this.logger.log(
      'Telegram getUpdates polling started (local inbound). Send CONNECT in the bot chat.',
    );
  }

  async onModuleDestroy(): Promise<void> {
    this.running = false;
    if (this.loopPromise) {
      await this.loopPromise.catch(() => undefined);
    }
  }

  private async pollLoop(): Promise<void> {
    while (this.running) {
      try {
        const updates = await this.telegram.getUpdates(this.offset, 25);
        for (const update of updates) {
          this.offset = update.update_id + 1;
          const events = this.telegram.parseUpdate(update);
          if (events.length === 0) continue;
          this.logger.log(
            `Telegram update ${update.update_id}: ${events.map((e) => e.type).join(', ')}`,
          );
          await this.telegram.handleEvents(events);
        }
      } catch (err) {
        if (!this.running) break;
        this.logger.warn(
          `Telegram polling error: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        await sleep(3000);
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
