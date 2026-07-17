import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Logger,
  Post,
  Query,
  Req,
  type RawBodyRequest,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { TelegramCallbackDto } from './dto/telegram.dto';
import { TelegramService } from './telegram.service';
import type { TelegramInboundEvent } from './telegram.types';

/**
 * Public callback for telegram-service. Secret verification already happened
 * upstream; telegram-service sends no auth header, so the shared token is carried
 * on the callback_url query string registered with setWebhook.
 */
@Controller('telegram/webhook')
export class TelegramWebhookController {
  private readonly logger = new Logger(TelegramWebhookController.name);

  constructor(
    private readonly telegram: TelegramService,
    private readonly config: ConfigService,
  ) {}

  @Post()
  @HttpCode(200)
  handleEvents(
    @Query('token') token: string | undefined,
    @Body() body: TelegramCallbackDto,
  ): { received: boolean } {
    this.assertToken(token);

    const events = (body.events ?? []) as TelegramInboundEvent[];
    void this.telegram.handleEvents(events).catch((err: unknown) => {
      this.logger.error(
        err instanceof Error ? (err.stack ?? err.message) : String(err),
      );
    });

    return { received: true };
  }

  /**
   * Direct Telegram callback (without communication-service forwarding).
   * Verifies X-Telegram-Bot-Api-Secret-Token against TELEGRAM_WEBHOOK_SECRET.
   */
  @Post('direct')
  @HttpCode(200)
  handleDirect(
    @Req() req: RawBodyRequest<Request>,
    @Query('token') token: string | undefined,
  ): { received: boolean } {
    const expected = this.config.get<string>('TELEGRAM_CALLBACK_TOKEN')?.trim();
    if (expected) {
      this.assertToken(token);
    }

    const rawBody = req.rawBody;
    if (!Buffer.isBuffer(rawBody)) {
      throw new BadRequestException(
        'Raw body required for Telegram webhook verification',
      );
    }

    const secretHeader = req.headers['x-telegram-bot-api-secret-token'];
    const headerValue = Array.isArray(secretHeader)
      ? secretHeader[0]
      : secretHeader;
    this.telegram.verifyDirectWebhookSecret(headerValue);

    const events = this.telegram.parseDirectWebhookEvents(rawBody);
    this.logger.log(
      `Direct Telegram webhook: ${events.length} event(s) [${events.map((e) => e.type).join(', ')}]`,
    );
    void this.telegram.handleEvents(events).catch((err: unknown) => {
      this.logger.error(
        err instanceof Error ? (err.stack ?? err.message) : String(err),
      );
    });
    return { received: true };
  }

  private assertToken(token: string | undefined): void {
    const expected = this.config.get<string>('TELEGRAM_CALLBACK_TOKEN')?.trim();
    if (!expected) {
      throw new UnauthorizedException(
        'TELEGRAM_CALLBACK_TOKEN is not configured',
      );
    }

    const got = Buffer.from(token?.trim() ?? '');
    const want = Buffer.from(expected);
    if (got.length !== want.length || !timingSafeEqual(got, want)) {
      throw new UnauthorizedException('Invalid callback token');
    }
  }
}
