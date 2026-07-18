import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  Post,
  Query,
  Req,
  Res,
  type RawBodyRequest,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { WhatsAppCallbackDto } from './dto/whatsapp.dto';
import { WhatsAppService } from './whatsapp.service';
import type { WhatsAppInboundEvent } from './whatsapp.types';

/**
 * Public callbacks for Meta Cloud API (direct) and whatsapp-service forwarder.
 */
@Controller('whatsapp/webhook')
export class WhatsAppWebhookController {
  private readonly logger = new Logger(WhatsAppWebhookController.name);

  constructor(
    private readonly whatsapp: WhatsAppService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Forwarded callback from whatsapp-service. Secret verification already
   * happened upstream; shared token is on the callback_url query string.
   */
  @Post()
  @HttpCode(200)
  handleEvents(
    @Query('token') token: string | undefined,
    @Body() body: WhatsAppCallbackDto,
  ): { received: boolean } {
    this.assertToken(token);

    const events = (body.events ?? []) as WhatsAppInboundEvent[];
    void this.whatsapp.handleEvents(events).catch((err: unknown) => {
      this.logger.error(
        err instanceof Error ? (err.stack ?? err.message) : String(err),
      );
    });

    return { received: true };
  }

  /**
   * Meta webhook verification handshake (hub.mode / hub.verify_token / hub.challenge).
   */
  @Get('direct')
  verifyDirect(
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.verify_token') verifyToken: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
    @Res() res: Response,
  ): void {
    const result = this.whatsapp.verifySubscription(
      mode,
      verifyToken,
      challenge,
    );
    res.status(200).type('text/plain').send(result);
  }

  /**
   * Direct Meta Cloud API callback (without communication-service forwarding).
   * Verifies X-Hub-Signature-256 (HMAC-SHA256 of raw body with app secret).
   */
  @Post('direct')
  @HttpCode(200)
  handleDirect(
    @Req() req: RawBodyRequest<Request>,
    @Query('token') token: string | undefined,
  ): { received: boolean } {
    const expected = this.config.get<string>('WHATSAPP_CALLBACK_TOKEN')?.trim();
    if (expected) {
      this.assertToken(token);
    }

    const rawBody = req.rawBody;
    if (!Buffer.isBuffer(rawBody)) {
      throw new BadRequestException(
        'Raw body required for WhatsApp webhook verification',
      );
    }

    const signatureHeader = req.headers['x-hub-signature-256'];
    const headerValue = Array.isArray(signatureHeader)
      ? signatureHeader[0]
      : signatureHeader;
    this.whatsapp.verifyDirectWebhookSignature(headerValue, rawBody);

    const events = this.whatsapp.parseDirectWebhookEvents(rawBody);
    this.logger.log(
      `Direct WhatsApp webhook: ${events.length} event(s) [${events.map((e) => e.type).join(', ')}]`,
    );
    void this.whatsapp.handleEvents(events).catch((err: unknown) => {
      this.logger.error(
        err instanceof Error ? (err.stack ?? err.message) : String(err),
      );
    });
    return { received: true };
  }

  private assertToken(token: string | undefined): void {
    const expected = this.config.get<string>('WHATSAPP_CALLBACK_TOKEN')?.trim();
    if (!expected) {
      throw new UnauthorizedException(
        'WHATSAPP_CALLBACK_TOKEN is not configured',
      );
    }

    const got = Buffer.from(token?.trim() ?? '');
    const want = Buffer.from(expected);
    if (got.length !== want.length || !timingSafeEqual(got, want)) {
      throw new UnauthorizedException('Invalid callback token');
    }
  }
}
