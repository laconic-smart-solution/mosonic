import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { McpService } from './mcp.service';

@Controller('mcp')
export class McpController {
  constructor(
    private readonly mcpService: McpService,
    private readonly config: ConfigService,
  ) {}

  @Get('setup')
  async setup() {
    return await this.mcpService.createTestProfile();
  }

  @Get('connect/:platform')
  async connectAccount(@Param('platform') platform: string) {
    const connectUrl = await this.mcpService.getConnectUrl(platform);
    return { connectUrl };
  }

  @Get('callback')
  handleCallback(
    @Query()
    query: { platform?: string; accountId?: string; username?: string },
    @Res({ passthrough: false }) res: Response,
  ) {
    const { platform, accountId, username } = query;

    this.mcpService.saveConnectedAccount({
      platform: platform ?? '',
      accountId: accountId ?? '',
      username: username ?? '',
    });

    const frontend = this.config.get<string>(
      'FRONTEND_URL',
      'http://localhost:5173',
    );
    res.redirect(`${frontend}/settings?connected=${platform ?? ''}`);
  }

  @Get('test-post')
  async testPost() {
    return await this.mcpService.publishContent({
      channels: ['instagram'],
      content: 'Test post from NeuralTex',
    });
  }

  @Get('tools')
  async listTools() {
    return await this.mcpService.listMcpTools();
  }
}
