import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { User } from '../users/schemas/user.schema';
import { McpService } from './mcp.service';

@Controller('zernio')
export class ZernioController {
  constructor(
    private readonly mcpService: McpService,
    private readonly config: ConfigService,
  ) {}

  @Post('profile/create')
  @UseGuards(JwtAuthGuard)
  async createProfile(@Req() req: Request) {
    const user = req.auth!.localUser as User;
    return await this.mcpService.ensureZernioProfile(user.userId);
  }

  @Get('connect/:platform')
  @UseGuards(JwtAuthGuard)
  async connectAccount(
    @Req() req: Request,
    @Param('platform') platform: string,
  ) {
    const user = req.auth!.localUser as User;
    const connectUrl = await this.mcpService.getConnectUrl(platform, user.userId);
    return { connectUrl };
  }

  @Get('callback')
  async handleCallback(
    @Query()
    query: {
      platform?: string;
      accountId?: string;
      username?: string;
      state?: string;
    },
    @Res({ passthrough: false }) res: Response,
  ) {
    const frontend = this.config.get<string>('FRONTEND_URL', 'http://localhost:5173');
    try {
      await this.mcpService.handleOAuthCallback(query);
      res.redirect(
        `${frontend}/settings/accounts?connected=${encodeURIComponent(query.platform ?? '')}`,
      );
    } catch {
      res.redirect(`${frontend}/settings/accounts?zernio_error=callback_failed`);
    }
  }

  @Post('accounts/sync')
  @UseGuards(JwtAuthGuard)
  async syncAccounts(@Req() req: Request) {
    const user = req.auth!.localUser as User;
    return await this.mcpService.syncAccounts(user.userId);
  }

  @Get('accounts')
  @UseGuards(JwtAuthGuard)
  async getConnectedAccounts(@Req() req: Request) {
    const user = req.auth!.localUser as User;
    return await this.mcpService.getConnectedAccounts(user.userId);
  }

  @Delete('accounts/:channel')
  @UseGuards(JwtAuthGuard)
  async disconnectAccount(
    @Req() req: Request,
    @Param('channel') channel: string,
  ) {
    const user = req.auth!.localUser as User;
    await this.mcpService.disconnectAccount(user.userId, channel);
    return { success: true };
  }
}

