import {
  Controller,
  Delete,
  Get,
  Logger,
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
  private readonly logger = new Logger(ZernioController.name);

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

  @Get('connection-credit')
  @UseGuards(JwtAuthGuard)
  async getConnectionCredit(@Req() req: Request) {
    const user = req.auth!.localUser as User;
    return await this.mcpService.getConnectionCreditQuote(user.userId);
  }

  @Post('unlock/:platform')
  @UseGuards(JwtAuthGuard)
  async unlockChannel(
    @Req() req: Request,
    @Param('platform') platform: string,
  ) {
    const user = req.auth!.localUser as User;
    return await this.mcpService.unlockChannel(platform, user.userId);
  }

  @Post('connect/:platform')
  @UseGuards(JwtAuthGuard)
  async connectChannel(
    @Req() req: Request,
    @Param('platform') platform: string,
  ) {
    const user = req.auth!.localUser as User;
    return await this.mcpService.connectChannel(platform, user.userId);
  }

  @Get('callback')
  async handleCallback(
    @Query()
    query: {
      platform?: string;
      connected?: string;
      accountId?: string;
      account_id?: string;
      username?: string;
      state?: string;
    },
    @Res({ passthrough: false }) res: Response,
  ) {
    const frontend = this.config.get<string>(
      'FRONTEND_URL',
      'http://localhost:5173',
    );
    try {
      const { platform } = await this.mcpService.handleOAuthCallback(query);
      res.redirect(
        `${frontend}/settings/accounts?connected=${encodeURIComponent(platform)}`,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Zernio OAuth callback failed: ${message}`);
      res.redirect(
        `${frontend}/settings/accounts?zernio_error=callback_failed`,
      );
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
    console.log('getConnectedAccounts', user.username);
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
