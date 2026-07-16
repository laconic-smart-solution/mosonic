import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
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
}
