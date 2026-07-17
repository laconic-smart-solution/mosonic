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
import { ViberCallbackDto } from './dto/viber.dto';
import { ViberService } from './viber.service';
import type { ViberInboundEvent } from './viber.types';

/**
 * Public callback for viber-service. Secret verification already happened
 * upstream; viber-service sends no auth header, so the shared token is carried
 * on the callback_url query string registered with setWebhook.
 */
@Controller('viber/webhook')
export class ViberWebhookController {
  private readonly logger = new Logger(ViberWebhookController.name);

  constructor(
    private readonly viber: ViberService,
    private readonly config: ConfigService,
  ) {}

  @Post()
  @HttpCode(200)
  handleEvents(
    @Query('token') token: string | undefined,
    @Body() body: ViberCallbackDto,
  ): { received: boolean } {
    this.assertToken(token);

    const events = (body.events ?? []) as ViberInboundEvent[];
    void this.viber.handleEvents(events).catch((err: unknown) => {
      this.logger.error(
        err instanceof Error ? (err.stack ?? err.message) : String(err),
      );
    });

    return { received: true };
  }

  /**
   * Direct Viber callback (without communication-service forwarding).
   * Verifies X-Viber-Content-Signature (HMAC-SHA256 of raw body with auth token).
   */
  @Post('direct')
  @HttpCode(200)
  handleDirect(
    @Req() req: RawBodyRequest<Request>,
    @Query('token') token: string | undefined,
  ): { received: boolean } {
    const expected = this.config.get<string>('VIBER_CALLBACK_TOKEN')?.trim();
    if (expected) {
      this.assertToken(token);
    }

    const rawBody = req.rawBody;
    if (!Buffer.isBuffer(rawBody)) {
      throw new BadRequestException(
        'Raw body required for Viber webhook verification',
      );
    }

    const signatureHeader = req.headers['x-viber-content-signature'];
    const headerValue = Array.isArray(signatureHeader)
      ? signatureHeader[0]
      : signatureHeader;
    this.viber.verifyDirectWebhookSignature(headerValue, rawBody);

    const events = this.viber.parseDirectWebhookEvents(rawBody);
    this.logger.log(
      `Direct Viber webhook: ${events.length} event(s) [${events.map((e) => e.type).join(', ')}]`,
    );
    void this.viber.handleEvents(events).catch((err: unknown) => {
      this.logger.error(
        err instanceof Error ? (err.stack ?? err.message) : String(err),
      );
    });
    return { received: true };
  }

  private assertToken(token: string | undefined): void {
    const expected = this.config.get<string>('VIBER_CALLBACK_TOKEN')?.trim();
    if (!expected) {
      throw new UnauthorizedException(
        'VIBER_CALLBACK_TOKEN is not configured',
      );
    }

    const got = Buffer.from(token?.trim() ?? '');
    const want = Buffer.from(expected);
    if (got.length !== want.length || !timingSafeEqual(got, want)) {
      throw new UnauthorizedException('Invalid callback token');
    }
  }
}
