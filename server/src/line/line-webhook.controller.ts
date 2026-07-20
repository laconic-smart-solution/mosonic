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
import { LineCallbackDto } from './dto/line.dto';
import { LineService } from './line.service';
import type { LineInboundEvent } from './line.types';

/**
 * Public callback for line-service. LINE signature verification already happened
 * upstream, and line-service sends no auth header, so the shared token is carried
 * on the callback_url query string registered in the LINE Console.
 */
@Controller('line/webhook')
export class LineWebhookController {
  private readonly logger = new Logger(LineWebhookController.name);

  constructor(
    private readonly line: LineService,
    private readonly config: ConfigService,
  ) {}

  @Post()
  @HttpCode(200)
  handleEvents(
    @Query('token') token: string | undefined,
    @Body() body: LineCallbackDto,
  ): { received: boolean } {
    this.assertToken(token);

    const events = (body.events ?? []) as LineInboundEvent[];
    void this.line.handleEvents(events).catch((err: unknown) => {
      this.logger.error(
        err instanceof Error ? (err.stack ?? err.message) : String(err),
      );
    });

    return { received: true };
  }

  /**
   * Direct LINE callback (without communication-service forwarding).
   * Verifies LINE signature against LINE_CHANNEL_SECRET and parses LINE-native payload.
   */
  @Post('direct')
  @HttpCode(200)
  handleDirect(
    @Req() req: RawBodyRequest<Request>,
    @Query('token') token: string | undefined,
  ): { received: boolean } {
    // Optional extra guard. If configured, direct webhook must include this token too.
    // Leave LINE_CALLBACK_TOKEN empty when LINE Console cannot append ?token=.
    const expected = this.config.get<string>('LINE_CALLBACK_TOKEN')?.trim();
    if (expected) {
      this.assertToken(token);
    }

    const rawBody = req.rawBody;
    if (!Buffer.isBuffer(rawBody)) {
      throw new BadRequestException('Raw body required for LINE signature verification');
    }
    const signature = req.headers['x-line-signature'];
    const headerValue = Array.isArray(signature) ? signature[0] : signature;
    this.line.verifyDirectWebhookSignature(headerValue, rawBody);

    const events = this.line.parseDirectWebhookEvents(rawBody);
    this.logger.log(
      `Direct LINE webhook: ${events.length} event(s) [${events.map((e) => e.type).join(', ')}]`,
    );
    void this.line.handleEvents(events).catch((err: unknown) => {
      this.logger.error(
        err instanceof Error ? (err.stack ?? err.message) : String(err),
      );
    });
    return { received: true };
  }

  private assertToken(token: string | undefined): void {
    const expected = this.config.get<string>('LINE_CALLBACK_TOKEN')?.trim();
    if (!expected) {
      throw new UnauthorizedException('LINE_CALLBACK_TOKEN is not configured');
    }

    const got = Buffer.from(token?.trim() ?? '');
    const want = Buffer.from(expected);
    if (got.length !== want.length || !timingSafeEqual(got, want)) {
      throw new UnauthorizedException('Invalid callback token');
    }
  }
}
