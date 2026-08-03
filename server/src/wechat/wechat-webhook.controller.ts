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
import { WechatCallbackDto } from './dto/wechat.dto';
import { WechatService } from './wechat.service';
import type { WechatInboundEvent } from './wechat.types';

/**
 * Public callbacks for WeChat Official Account (direct) and wechat-service forwarder.
 */
@Controller('wechat/webhook')
export class WechatWebhookController {
  private readonly logger = new Logger(WechatWebhookController.name);

  constructor(
    private readonly wechat: WechatService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Forwarded callback from wechat-service. Signature verification already
   * happened upstream; shared token is on the callback_url query string.
   */
  @Post()
  @HttpCode(200)
  handleEvents(
    @Query('token') token: string | undefined,
    @Body() body: WechatCallbackDto,
  ): { received: boolean } {
    this.assertToken(token);

    const events = (body.events ?? []) as WechatInboundEvent[];
    void this.wechat.handleEvents(events).catch((err: unknown) => {
      this.logger.error(
        err instanceof Error ? (err.stack ?? err.message) : String(err),
      );
    });

    return { received: true };
  }

  /**
   * WeChat URL verification handshake (signature / timestamp / nonce / echostr).
   */
  @Get('direct')
  verifyDirect(
    @Query('signature') signature: string | undefined,
    @Query('timestamp') timestamp: string | undefined,
    @Query('nonce') nonce: string | undefined,
    @Query('echostr') echostr: string | undefined,
    @Res() res: Response,
  ): void {
    const result = this.wechat.verifySubscription(
      signature,
      timestamp,
      nonce,
      echostr,
    );
    res.status(200).type('text/plain').send(result);
  }

  /**
   * Direct WeChat OA callback (without communication-service forwarding).
   * Verifies signature query params against WECHAT_TOKEN and parses XML body.
   */
  @Post('direct')
  @HttpCode(200)
  handleDirect(
    @Req() req: RawBodyRequest<Request>,
    @Query('token') token: string | undefined,
    @Query('signature') signature: string | undefined,
    @Query('timestamp') timestamp: string | undefined,
    @Query('nonce') nonce: string | undefined,
  ): string {
    const expected = this.config.get<string>('WECHAT_CALLBACK_TOKEN')?.trim();
    if (expected) {
      this.assertToken(token);
    }

    const rawBody = req.rawBody;
    if (!Buffer.isBuffer(rawBody)) {
      throw new BadRequestException(
        'Raw body required for WeChat webhook verification',
      );
    }

    this.wechat.verifyDirectWebhookSignature(signature, timestamp, nonce);

    const events = this.wechat.parseDirectWebhookEvents(rawBody);
    this.logger.log(
      `Direct WeChat webhook: ${events.length} event(s) [${events.map((e) => e.type).join(', ')}]`,
    );
    void this.wechat.handleEvents(events).catch((err: unknown) => {
      this.logger.error(
        err instanceof Error ? (err.stack ?? err.message) : String(err),
      );
    });
    // WeChat expects the literal string "success".
    return 'success';
  }

  private assertToken(token: string | undefined): void {
    const expected = this.config.get<string>('WECHAT_CALLBACK_TOKEN')?.trim();
    if (!expected) {
      throw new UnauthorizedException(
        'WECHAT_CALLBACK_TOKEN is not configured',
      );
    }

    const got = Buffer.from(token?.trim() ?? '');
    const want = Buffer.from(expected);
    if (got.length !== want.length || !timingSafeEqual(got, want)) {
      throw new UnauthorizedException('Invalid callback token');
    }
  }
}
