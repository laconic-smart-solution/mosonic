import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type ConnectedAccountRecord,
  UsersService,
} from '../users/users.service';
import { ZernioClient } from './zernio/zernio.client';
import { ZernioMcpClient } from './zernio/zernio.mcp';
import { ZernioRestClient } from './zernio/zernio-rest.client';
import { ZernioOauthStateService } from './zernio-oauth-state.service';

@Injectable()
export class McpService {
  private readonly logger = new Logger(McpService.name);

  constructor(
    private readonly zernio: ZernioClient,
    private readonly zernioMcp: ZernioMcpClient,
    private readonly zernioRest: ZernioRestClient,
    private readonly usersService: UsersService,
    private readonly oauthState: ZernioOauthStateService,
    private readonly config: ConfigService,
  ) {}

  /** Lazy-create Zernio REST profile and persist on the user. */
  async ensureZernioProfile(
    userId: string,
  ): Promise<{ zernioProfileId: string }> {
    const id = await this.ensureZernioProfileId(userId);
    return { zernioProfileId: id };
  }

  async getConnectUrl(platform: string, userId: string): Promise<string> {
    const profileId = await this.ensureZernioProfileId(userId);
    const state = await this.oauthState.signState(userId);
    const base = this.config.get<string>('ZERNIO_CALLBACK_URL')?.trim();
    if (!base) {
      throw new Error('ZERNIO_CALLBACK_URL is not set');
    }
    const redirectUrl = this.oauthState.buildCallbackUrlWithState(base, state);
    return await this.zernio.getConnectUrl(platform, profileId, redirectUrl);
  }

  async handleOAuthCallback(query: {
    state?: string;
    platform?: string;
    accountId?: string;
    username?: string;
  }): Promise<void> {
    const state = query.state;
    if (!state?.trim()) {
      throw new BadRequestException('Missing OAuth state');
    }
    const { userId } = await this.oauthState.verifyState(state);
    const platform = query.platform?.trim() ?? '';
    const accountId = query.accountId?.trim() ?? '';
    if (!platform || !accountId) {
      throw new BadRequestException(
        'Missing platform or accountId from Zernio',
      );
    }
    await this.usersService.setZernioConnectedAccount(
      userId,
      platform,
      accountId,
    );
    try {
      await this.syncAccounts(userId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Zernio account sync skipped after callback for ${userId}: ${message}`,
      );
    }
    this.logger.log(
      `Zernio OAuth saved ${platform} for user ${userId} (${query.username ?? ''})`,
    );
  }

  async syncAccounts(userId: string): Promise<{
    accounts: ConnectedAccountRecord[];
  }> {
    const profileId = await this.ensureZernioProfileId(userId);
    const raw = await this.zernio.listAccounts(profileId);
    const accounts = this.parseConnectedAccounts(raw);
    await this.usersService.syncZernioConnectedAccounts(userId, accounts);
    return { accounts };
  }

  async getConnectedAccounts(userId: string): Promise<{
    accounts: ConnectedAccountRecord[];
  }> {
    const accounts = await this.usersService.getZernioConnectedAccounts(userId);
    return { accounts };
  }

  async disconnectAccount(userId: string, channel: string): Promise<void> {
    await this.usersService.disconnectZernioConnectedAccount(userId, channel);
  }

  async publishCreatePostBatch(
    userId: string,
    payload: {
      platforms: Array<{
        platform: string;
        accountId: string;
        content: string;
        mediaUrl: string | null;
        title?: string | null;
      }>;
      publishNow: boolean;
      scheduledAt: string | null;
    },
  ): Promise<{ postId: string; raw: unknown }> {
    const ctx = await this.usersService.getZernioPublishContext(userId);
    return await this.zernioRest.publishCreatePost({
      profileId: ctx.profileId,
      platforms: payload.platforms,
      publishNow: payload.publishNow,
      scheduledAt: payload.scheduledAt,
    });
  }

  async updatePost(payload: {
    postId: string;
    content?: string;
    scheduledFor?: string;
    title?: string;
  }): Promise<{ success: boolean }> {
    return await this.zernioRest.updatePost(payload);
  }

  async publishContent(
    userId: string,
    payload: {
      channels: string[];
      content: string;
      imageUrl?: string;
      videoUrl?: string;
      scheduledAt?: string;
    },
  ) {
    const ctx = await this.usersService.getZernioPublishContext(userId);

    const channels = payload.channels
      .map((ch) => ch.trim().toLowerCase())
      .filter(Boolean);
    const missingChannels = channels.filter(
      (channel) => !ctx.accounts[channel]?.trim(),
    );
    if (missingChannels.length > 0) {
      throw new BadRequestException(
        `Missing Zernio account ids for channels: ${missingChannels.join(', ')}`,
      );
    }

    if (!channels.length) {
      throw new BadRequestException(
        'No Zernio account ids for the selected channels; connect those platforms first',
      );
    }

    const mediaUrl =
      [payload.imageUrl, payload.videoUrl]
        .filter((u): u is string => Boolean(u?.trim()))
        .join(',') || null;

    /** Admin test harness: same shape as batch publish (`postId` + `raw`). */
    return await this.zernioRest.publishCreatePost({
      profileId: ctx.profileId,
      platforms: channels.map((channel) => ({
        platform: channel,
        accountId: ctx.accounts[channel]!.trim(),
        content: payload.content,
        mediaUrl,
      })),
      publishNow: !payload.scheduledAt,
      scheduledAt: payload.scheduledAt?.trim() ?? null,
    });
  }

  async getAnalytics(postId: string) {
    return await this.zernioRest.getPostAnalytics(postId);
  }

  /** REST get-post for scheduled upload reconciliation. */
  async getZernioPost(postId: string): Promise<unknown | null> {
    return await this.zernioRest.getPost(postId);
  }

  async listMcpTools() {
    return await this.zernioMcp.listTools();
  }

  private async ensureZernioProfileId(userId: string): Promise<string> {
    const user = await this.usersService.findByUserId(userId);
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }
    const existing = user.zernioProfileId?.trim();
    if (existing) {
      return existing;
    }
    const name =
      user.email?.trim() ||
      user.username?.trim() ||
      `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() ||
      user.userId;
    const profile = await this.zernio.createProfile(name);
    await this.usersService.setZernioProfileId(userId, profile._id);
    return profile._id;
  }

  private parseConnectedAccounts(raw: unknown): ConnectedAccountRecord[] {
    if (!Array.isArray(raw)) return [];
    const byChannel = new Map<string, ConnectedAccountRecord>();
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const record = item as Record<string, unknown>;
      const channel = this.readFirstString(record, [
        'platform',
        'channel',
        'provider',
        'network',
        'type',
      ])
        ?.trim()
        .toLowerCase();
      const accountId = this.readFirstString(record, [
        'accountId',
        'account_id',
        '_id',
        'id',
      ])?.trim();
      if (!channel || !accountId) continue;
      byChannel.set(channel, {
        channel,
        accountId,
        connectedAt: new Date(),
      });
    }
    return Array.from(byChannel.values());
  }

  private readFirstString(
    record: Record<string, unknown>,
    keys: string[],
  ): string | undefined {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) {
        return value;
      }
    }
    return undefined;
  }
}
