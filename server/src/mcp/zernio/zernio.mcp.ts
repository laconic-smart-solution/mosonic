import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

import {
  extractPostIdFromMcpCreateResult,
  getFriendlyZernioPublishError,
  parseMcpToolJson,
} from './zernio-mcp-publish.util';

const PLACEHOLDER_ZERNIO_KEYS = new Set([
  'your_zernio_api_key_here',
  'changeme',
  'replace_me',
]);

@Injectable()
export class ZernioMcpClient implements OnModuleInit {
  private client: Client | null = null;
  private connected = false;
  private connectError: string | null = null;
  private readonly logger = new Logger(ZernioMcpClient.name);

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    try {
      await this.connect();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.connectError = message;
      this.connected = false;
      this.logger.warn(
        `Zernio MCP not connected at startup (${message}). ` +
          'Publishing and analytics via MCP will fail until ZERNIO_API_KEY is valid. ' +
          'Other API features will still run.',
      );
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  private isMcpDisabled(): boolean {
    const raw = this.config
      .get<string>('ZERNIO_MCP_DISABLED')
      ?.trim()
      .toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'yes';
  }

  private resolveCredentials(): { apiKey: string; mcpUrl: string } | null {
    if (this.isMcpDisabled()) {
      return null;
    }
    const apiKey = this.config.get<string>('ZERNIO_API_KEY')?.trim() ?? '';
    const mcpUrl = this.config.get<string>('ZERNIO_MCP_URL')?.trim() ?? '';
    if (!apiKey || PLACEHOLDER_ZERNIO_KEYS.has(apiKey.toLowerCase())) {
      return null;
    }
    if (!mcpUrl) {
      return null;
    }
    return { apiKey, mcpUrl };
  }

  private async connect(): Promise<void> {
    const creds = this.resolveCredentials();
    if (!creds) {
      throw new Error(
        'Zernio MCP is not configured (set ZERNIO_API_KEY and ZERNIO_MCP_URL, or ZERNIO_MCP_DISABLED=true to skip)',
      );
    }

    const client = new Client({
      name: 'mosonic',
      version: '1.0.0',
    });

    const transport = new StreamableHTTPClientTransport(new URL(creds.mcpUrl), {
      requestInit: {
        headers: {
          Authorization: `Bearer ${creds.apiKey}`,
        },
      },
    });

    await client.connect(transport);
    this.client = client;
    this.connected = true;
    this.connectError = null;
    this.logger.log('Connected to Zernio MCP server');
  }

  private async ensureConnected(): Promise<Client> {
    if (this.connected && this.client) {
      return this.client;
    }
    try {
      await this.connect();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.connectError = message;
      this.connected = false;
      throw new Error(
        `Zernio MCP is unavailable: ${message}. Check ZERNIO_API_KEY and ZERNIO_MCP_URL.`,
      );
    }
    if (!this.client) {
      throw new Error(
        this.connectError ??
          'Zernio MCP is unavailable. Check ZERNIO_API_KEY and ZERNIO_MCP_URL.',
      );
    }
    return this.client;
  }

  /**
   * Legacy single-caption cross-post (admin test-harness / older flows).
   * Prefer {@link publishCreatePost} for upload batch publishes.
   */
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

    const client = await this.ensureConnected();
    return await client.callTool({
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

  /**
   * Batch create per-platform content + optional schedule (Zernio owns the queue).
   * Spike / verify on each deployment: `GET /mcp/tools` — tool name and argument keys must
   * match the live Zernio MCP server (documented here as `posts_create_post`).
   */
  async publishCreatePost(payload: {
    profileId: string;
    platforms: Array<{
      platform: string;
      accountId: string;
      content: string;
      mediaUrl: string | null;
      title?: string | null;
    }>;
    publishNow: boolean;
    scheduledAt: string | null;
  }): Promise<{ postId: string; raw: unknown }> {
    const names = payload.platforms.map((p) => p.platform).join(', ');
    this.logger.log(`posts_create_post → ${names}`);

    if (!payload.profileId?.trim()) {
      throw new Error('Zernio publish failed: missing profileId');
    }
    if (!Array.isArray(payload.platforms) || payload.platforms.length === 0) {
      throw new Error('Zernio publish failed: no platforms provided');
    }
    const invalidPlatform = payload.platforms.find(
      (p) => !p.platform?.trim() || !p.accountId?.trim() || !p.content?.trim(),
    );
    if (invalidPlatform) {
      throw new Error(
        'Zernio publish failed: each platform requires platform, accountId, and content',
      );
    }

    try {
      const client = await this.ensureConnected();
      const result = await client.callTool({
        name: 'posts_create_post',
        arguments: {
          profile_id: payload.profileId,
          publish_now: payload.publishNow,
          scheduled_for: payload.scheduledAt ?? undefined,
          platforms: JSON.stringify(
            payload.platforms.map((p) => {
              const base: Record<string, unknown> = {
                platform: p.platform,
                accountId: p.accountId,
                customContent: p.content,
                mediaItems: p.mediaUrl
                  ? [{ url: p.mediaUrl, type: 'image' }]
                  : [],
              };
              const t = p.title?.trim();
              if (t) {
                base.customTitle = t;
              }
              return base;
            }),
          ),
        },
      });

      const rec = result as Record<string, unknown> | null;
      if (rec?.isError === true) {
        this.logger.warn(
          `Zernio posts_create_post(${payload.profileId}) returned isError for: ${names}`,
        );
        const friendly = this.mapPublishError(result);
        throw new Error(friendly || 'Zernio publish failed');
      }

      try {
        const postId = extractPostIdFromMcpCreateResult(result);
        if (!postId?.trim()) {
          throw new Error('Empty postId');
        }
        return { postId, raw: result };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Zernio posts_create_post(${payload.profileId}) could not extract postId: ${message}`,
        );
        throw new Error('Zernio publish failed: invalid response');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Zernio posts_create_post(${payload.profileId}) threw for ${names}: ${message}`,
      );
      if (message.startsWith('Zernio publish failed:')) {
        throw new Error(message);
      }
      const friendly = this.mapPublishError(err);
      throw new Error(friendly || message || 'Zernio publish failed');
    }
  }

  /**
   * Update editable fields for an existing draft / scheduled Zernio post.
   * Published posts can only have recycling config updated (not handled here).
   */
  async updatePost(payload: {
    postId: string;
    content?: string;
    scheduledFor?: string;
    title?: string;
  }): Promise<{ success: boolean }> {
    const postId = payload.postId.trim();
    if (!postId) {
      throw new Error('Zernio update failed: missing postId');
    }

    this.logger.log(`posts_update → postId: ${postId}`);

    const args: Record<string, unknown> = {
      post_id: postId,
    };
    if (payload.content !== undefined) {
      args.content = payload.content;
    }
    if (payload.scheduledFor !== undefined) {
      args.scheduled_for = payload.scheduledFor;
    }
    if (payload.title !== undefined) {
      args.title = payload.title;
    }

    try {
      const client = await this.ensureConnected();
      const result = await client.callTool({
        name: 'posts_update',
        arguments: args,
      });
      this.logger.log(`posts_update result: ${JSON.stringify(result)}`);

      const rec = result as Record<string, unknown> | null;
      if (rec?.isError === true) {
        const friendly = this.mapPublishError(result);
        throw new Error(friendly || 'Zernio update failed');
      }

      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Zernio posts_update(${postId}) threw: ${message}`);
      const friendly = this.mapPublishError(err);
      throw new Error(friendly || message || 'Zernio update failed');
    }
  }

  mapPublishError(err: unknown): string {
    return getFriendlyZernioPublishError(err);
  }

  /** Zernio MCP `get_analytics` — returns parsed JSON body or null on empty / tool error. */
  async getPostAnalytics(postId: string): Promise<unknown | null> {
    try {
      const client = await this.ensureConnected();
      const result = await client.callTool({
        name: 'get_analytics',
        arguments: { post_id: postId },
      });
      const rec = result as Record<string, unknown> | null;

      console.log('rec', rec);
      if (rec?.isError === true) {
        this.logger.warn(
          `Zernio get_analytics(${postId}): tool returned isError`,
        );
        return null;
      }
      const parsed = parseMcpToolJson(result);
      if (parsed == null) {
        this.logger.warn(
          `Zernio get_analytics(${postId}): empty or non-JSON result`,
        );
        return null;
      }
      return parsed;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Zernio get_analytics(${postId}) threw: ${message}`);
      throw err;
    }
  }

  /**
   * Fetch a single post by id for scheduled-sync reconciliation.
   * Spike on deploy: `GET /mcp/tools` — defaults to `posts_get` + `post_id`; override with
   * `ZERNIO_MCP_GET_POST_TOOL` if the live Zernio server uses a different name.
   */
  async getPost(postId: string): Promise<unknown | null> {
    const toolName =
      this.config.get<string>('ZERNIO_MCP_GET_POST_TOOL')?.trim() ||
      'posts_get';
    try {
      const client = await this.ensureConnected();
      const result = await client.callTool({
        name: toolName,
        arguments: { post_id: postId },
      });
      const rec = result as Record<string, unknown> | null;
      if (rec?.isError === true) {
        this.logger.warn(
          `Zernio ${toolName}(${postId}): tool returned isError`,
        );
        return null;
      }
      const parsed = parseMcpToolJson(result);
      if (parsed == null) {
        this.logger.warn(
          `Zernio ${toolName}(${postId}): empty or non-JSON result`,
        );
        return null;
      }
      return parsed;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Zernio ${toolName}(${postId}) threw: ${message}`);
      throw err;
    }
  }

  async listTools() {
    const client = await this.ensureConnected();
    const { tools } = await client.listTools();
    console.log('tools', tools);
    return tools.map((t) => ({ name: t.name, description: t.description }));
  }

  private minutesFromNow(isoDatetime: string): number {
    const diff = new Date(isoDatetime).getTime() - Date.now();
    return Math.round(diff / 60000);
  }
}
