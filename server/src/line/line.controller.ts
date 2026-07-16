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
import { LineQrQueryDto } from './dto/line.dto';
import { LineService } from './line.service';

@Controller('line')
@UseGuards(JwtAuthGuard)
export class LineController {
  constructor(private readonly line: LineService) {}

  /** JSON QR payload: add-friend URL plus a base64 data URI for inline rendering. */
  @Get('qr')
  async getQr(@Query() query: LineQrQueryDto) {
    return this.line.getQrCode(query.basicId, query.size);
  }

  /** Raw PNG so a browser can render <img src="/line/qr.png"> using the auth cookie. */
  @Get('qr.png')
  async getQrPng(
    @Query() query: LineQrQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const png = await this.line.getQrPng(query.basicId, query.size);
    res.set({
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400',
    });
    res.send(png);
  }

  /**
   * Start (or resume) LINE account linking.
   * Returns QR + CONNECT code when not yet linked; connected status when already linked.
   */
  @Post('connect')
  async startConnect(@Req() req: Request) {
    const user = req.auth!.localUser as UserRecord;
    return this.line.startConnect(user.userId);
  }

  /** Poll whether the logged-in user has linked LINE. */
  @Get('connect/status')
  async connectStatus(@Req() req: Request) {
    const user = req.auth!.localUser as UserRecord;
    return this.line.getConnectStatus(user.userId);
  }

  /** Unlink LINE from the logged-in Mosonic account. */
  @Delete('connect')
  @HttpCode(200)
  async disconnect(@Req() req: Request) {
    const user = req.auth!.localUser as UserRecord;
    await this.line.disconnect(user.userId);
    return { success: true };
  }
}
