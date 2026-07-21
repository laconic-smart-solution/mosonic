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
import { WechatQrQueryDto } from './dto/wechat.dto';
import { WechatService } from './wechat.service';

@Controller('wechat')
@UseGuards(JwtAuthGuard)
export class WechatController {
  constructor(private readonly wechat: WechatService) {}

  /** JSON QR payload: chat URL plus a base64 data URI for inline rendering. */
  @Get('qr')
  async getQr(@Query() query: WechatQrQueryDto) {
    return this.wechat.getQrCode(query.sceneStr, query.oaUsername, query.size);
  }

  /** Raw PNG so a browser can render <img src="/wechat/qr.png"> using the auth cookie. */
  @Get('qr.png')
  async getQrPng(
    @Query() query: WechatQrQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const png = await this.wechat.getQrPng(
      query.sceneStr,
      query.oaUsername,
      query.size,
    );
    res.set({
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=300',
    });
    res.send(png);
  }

  /**
   * Start (or resume) WeChat Official Account linking.
   * Returns scene QR + CONNECT code when not yet linked; connected status when already linked.
   */
  @Post('connect')
  async startConnect(@Req() req: Request) {
    const user = req.auth!.localUser as UserRecord;
    return this.wechat.startConnect(user.userId);
  }

  /** Poll whether the logged-in user has linked WeChat. */
  @Get('connect/status')
  async connectStatus(@Req() req: Request) {
    const user = req.auth!.localUser as UserRecord;
    return this.wechat.getConnectStatus(user.userId);
  }

  /** Unlink WeChat from the logged-in Mosonic account. */
  @Delete('connect')
  @HttpCode(200)
  async disconnect(@Req() req: Request) {
    const user = req.auth!.localUser as UserRecord;
    await this.wechat.disconnect(user.userId);
    return { success: true };
  }
}
