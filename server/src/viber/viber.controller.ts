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
import { ViberQrQueryDto } from './dto/viber.dto';
import { ViberService } from './viber.service';

@Controller('viber')
@UseGuards(JwtAuthGuard)
export class ViberController {
  constructor(private readonly viber: ViberService) {}

  /** JSON QR payload: bot URL plus a base64 data URI for inline rendering. */
  @Get('qr')
  async getQr(@Query() query: ViberQrQueryDto) {
    return this.viber.getQrCode(query.uri, query.size, query.start);
  }

  /** Raw PNG so a browser can render <img src="/viber/qr.png"> using the auth cookie. */
  @Get('qr.png')
  async getQrPng(
    @Query() query: ViberQrQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const png = await this.viber.getQrPng(query.uri, query.size, query.start);
    res.set({
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400',
    });
    res.send(png);
  }

  /**
   * Start (or resume) Viber account linking.
   * Returns QR + CONNECT code when not yet linked; connected status when already linked.
   */
  @Post('connect')
  async startConnect(@Req() req: Request) {
    const user = req.auth!.localUser as UserRecord;
    return this.viber.startConnect(user.userId);
  }

  /** Poll whether the logged-in user has linked Viber. */
  @Get('connect/status')
  async connectStatus(@Req() req: Request) {
    const user = req.auth!.localUser as UserRecord;
    return this.viber.getConnectStatus(user.userId);
  }

  /** Unlink Viber from the logged-in Mosonic account. */
  @Delete('connect')
  @HttpCode(200)
  async disconnect(@Req() req: Request) {
    const user = req.auth!.localUser as UserRecord;
    await this.viber.disconnect(user.userId);
    return { success: true };
  }
}
