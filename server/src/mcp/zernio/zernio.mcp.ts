import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

@Injectable()
export class ZernioMcpClient implements OnModuleInit {
  private client!: Client;
  private readonly logger = new Logger(ZernioMcpClient.name);

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    await this.connect();
  }

  private async connect() {
    const apiKey = this.config.get<string>('ZERNIO_API_KEY');
    const mcpUrl = this.config.get<string>('ZERNIO_MCP_URL');
    if (!apiKey) {
      this.logger.error('ZERNIO_API_KEY is not set');
      throw new Error('ZERNIO_API_KEY is not set');
    }
    if (!mcpUrl) {
      this.logger.error('ZERNIO_MCP_URL is not set');
      throw new Error('ZERNIO_MCP_URL is not set');
    }

    this.client = new Client({
      name: 'neuraltex',
      version: '1.0.0',
    });

    const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
      requestInit: {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      },
    });

    await this.client.connect(transport);
    this.logger.log('Connected to Zernio MCP server');
  }

  async publishPost(payload: {
    profileId: string;
    platforms: string;
    accountIds: string;
    content: string;
    mediaUrls?: string;
    publishNow?: boolean;
    scheduledAt?: string;
  }) {
    this.logger.log(`Publishing to: ${payload.platforms}`);

    return await this.client.callTool({
      name: 'posts_cross_post',
      arguments: {
        content: payload.content,
        platforms: payload.platforms,
        account_ids: payload.accountIds,
        profile_id: payload.profileId,
        media_urls: payload.mediaUrls ?? '',
        publish_now: payload.publishNow ?? !payload.scheduledAt,
        ...(payload.scheduledAt && {
          schedule_minutes: this.minutesFromNow(payload.scheduledAt),
        }),
      },
    });
  }

  async getPostAnalytics(postId: string) {
    return await this.client.callTool({
      name: 'get_analytics',
      arguments: { post_id: postId },
    });
  }

  async listTools() {
    const { tools } = await this.client.listTools();
    return tools.map((t) => ({ name: t.name, description: t.description }));
  }

  private minutesFromNow(isoDatetime: string): number {
    const diff = new Date(isoDatetime).getTime() - Date.now();
    return Math.round(diff / 60000);
  }
}
