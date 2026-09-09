import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { User } from '../users/schemas/user.schema';
import { RedNoteLoginInProgressError } from './errors/rednote.errors';
import { RedNoteService } from './rednote.service';
import { ConflictException } from '@nestjs/common';

@Controller('rednote')
@UseGuards(JwtAuthGuard)
export class RedNoteController {
  constructor(private readonly rednote: RedNoteService) {}

  @Post('connect')
  async connect(@Req() req: Request) {
    const user = req.auth!.localUser as User;
    try {
      return await this.rednote.startConnect(user.userId);
    } catch (err) {
      if (err instanceof RedNoteLoginInProgressError) {
        throw new ConflictException(err.message);
      }
      throw err;
    }
  }

  @Post('connect/cancel')
  @HttpCode(200)
  async cancelConnect(@Req() req: Request) {
    const user = req.auth!.localUser as User;
    return this.rednote.cancelConnect(user.userId);
  }

  /** Poll latest QR frame (fallback when Socket.IO delivery fails). */
  @Get('connect/qr')
  async getConnectQr(@Req() req: Request) {
    const user = req.auth!.localUser as User;
    return this.rednote.getLatestQrFrame(user.userId);
  }

  @Get('accounts')
  async getAccounts(@Req() req: Request) {
    const user = req.auth!.localUser as User;
    return this.rednote.getAccountStatus(user.userId);
  }

  @Post('health-check')
  async healthCheck(@Req() req: Request) {
    const user = req.auth!.localUser as User;
    return this.rednote.healthCheck(user.userId);
  }

  @Delete('accounts')
  @HttpCode(200)
  async disconnect(@Req() req: Request) {
    const user = req.auth!.localUser as User;
    await this.rednote.disconnect(user.userId);
    return { success: true };
  }
}
