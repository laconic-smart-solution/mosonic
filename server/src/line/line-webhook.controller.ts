import {
  Body,
  Controller,
  HttpCode,
  Logger,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
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
