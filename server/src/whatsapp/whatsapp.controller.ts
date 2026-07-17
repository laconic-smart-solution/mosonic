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
import { WhatsAppQrQueryDto } from './dto/whatsapp.dto';
import { WhatsAppService } from './whatsapp.service';

@Controller('whatsapp')
@UseGuards(JwtAuthGuard)
export class WhatsAppController {
  constructor(private readonly whatsapp: WhatsAppService) {}

  /** JSON QR payload: wa.me URL plus a base64 data URI for inline rendering. */
  @Get('qr')
  async getQr(@Query() query: WhatsAppQrQueryDto) {
    return this.whatsapp.getQrCode(query.phone, query.size, query.text);
  }

  /** Raw PNG so a browser can render <img src="/whatsapp/qr.png"> using the auth cookie. */
  @Get('qr.png')
  async getQrPng(
    @Query() query: WhatsAppQrQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const png = await this.whatsapp.getQrPng(
      query.phone,
      query.size,
      query.text,
    );
    res.set({
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400',
    });
    res.send(png);
  }

  /**
   * Start (or resume) WhatsApp account linking.
   * Returns QR + CONNECT code when not yet linked; connected status when already linked.
   */
  @Post('connect')
  async startConnect(@Req() req: Request) {
    const user = req.auth!.localUser as UserRecord;
    return this.whatsapp.startConnect(user.userId);
  }

  /** Poll whether the logged-in user has linked WhatsApp. */
  @Get('connect/status')
  async connectStatus(@Req() req: Request) {
    const user = req.auth!.localUser as UserRecord;
    return this.whatsapp.getConnectStatus(user.userId);
  }

  /** Unlink WhatsApp from the logged-in Mosonic account. */
  @Delete('connect')
  @HttpCode(200)
  async disconnect(@Req() req: Request) {
    const user = req.auth!.localUser as UserRecord;
    await this.whatsapp.disconnect(user.userId);
    return { success: true };
  }
}
