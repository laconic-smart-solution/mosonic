import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { UserRecord } from '../domain/users/user.types';
import { TelegramQrQueryDto } from './dto/telegram.dto';
import { TelegramService } from './telegram.service';

@Controller('telegram')
@UseGuards(JwtAuthGuard)
export class TelegramController {
  constructor(private readonly telegram: TelegramService) {}

  /** JSON QR payload: bot URL plus a base64 data URI for inline rendering. */
  @Get('qr')
  async getQr(@Query() query: TelegramQrQueryDto) {
    return this.telegram.getQrCode(query.botUsername, query.size, query.start);
  }

  /** Raw PNG so a browser can render <img src="/telegram/qr.png"> using the auth cookie. */
  @Get('qr.png')
  async getQrPng(
    @Query() query: TelegramQrQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const png = await this.telegram.getQrPng(
      query.botUsername,
      query.size,
      query.start,
    );
    res.set({
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400',
    });
    res.send(png);
  }

  /**
   * Start (or resume) Telegram account linking.
   * Returns QR + CONNECT code when not yet linked; connected status when already linked.
   */
  @Post('connect')
  async startConnect(@Req() req: Request) {
    const user = req.auth!.localUser as UserRecord;
    return this.telegram.startConnect(user.userId);
  }

  /** Poll whether the logged-in user has linked Telegram. */
  @Get('connect/status')
  async connectStatus(@Req() req: Request) {
    const user = req.auth!.localUser as UserRecord;
    return this.telegram.getConnectStatus(user.userId);
  }

  /** Unlink Telegram from the logged-in Mosonic account. */
  @Delete('connect')
  @HttpCode(200)
  async disconnect(@Req() req: Request) {
    const user = req.auth!.localUser as UserRecord;
    await this.telegram.disconnect(user.userId);
    return { success: true };
  }
}
