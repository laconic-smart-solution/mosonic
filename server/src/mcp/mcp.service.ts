import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CreditCalculationService } from '../credit/credit-calculation.service';
import { CreditService } from '../credit/credit.service';
import { SOCIAL_ACCOUNT_CONNECT_NODE_TYPE } from '../credit/lib/billable-node-credit-types';
import { NodeCreditPriceService } from '../credit/node-credit-price.service';
import {
  type ConnectedAccountRecord,
  UsersService,
} from '../users/users.service';
import {
  pickZernioProfileForUser,
  ZernioClient,
  ZernioClientError,
} from './zernio/zernio.client';
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
    private readonly creditService: CreditService,
    private readonly nodeCreditPriceService: NodeCreditPriceService,
    private readonly creditCalculation: CreditCalculationService,
  ) {}

  /** Lazy-create Zernio REST profile and persist on the user. */
  async ensureZernioProfile(
    userId: string,
  ): Promise<{ zernioProfileId: string }> {
    const id = await this.ensureZernioProfileId(userId);
    return { zernioProfileId: id };
  }

  /** Charge unlock credits and persist the channel slot (no OAuth redirect). */
  async unlockChannel(
    platform: string,
    userId: string,
  ): Promise<{ unlocked: true; alreadyUnlocked: boolean }> {
    const accounts = await this.usersService.getZernioConnectedAccounts(userId);
    if (this.isChannelConnected(accounts, platform)) {
      throw new BadRequestException(
        `Publishing channel "${platform}" is already connected`,
      );
    }

    const creditsEach =
      (await this.nodeCreditPriceService.getActiveCostCredit(
        SOCIAL_ACCOUNT_CONNECT_NODE_TYPE,
      )) ?? 0;
    const config = await this.creditCalculation.getConfig();
    const channel = platform.trim().toLowerCase();
    const { alreadyUnlocked } = await this.creditService.unlockSocialChannel({
      userId,
      channel,
      credits: creditsEach,
      creditPriceUsd: config.creditPriceUsd,
    });

    return { unlocked: true, alreadyUnlocked };
  }

  /** OAuth redirect URL for an already-unlocked publishing channel. */
  async connectChannel(
    platform: string,
    userId: string,
  ): Promise<{ connectUrl: string }> {
    const accounts = await this.usersService.getZernioConnectedAccounts(userId);
    if (this.isChannelConnected(accounts, platform)) {
      throw new BadRequestException(
        `Publishing channel "${platform}" is already connected`,
      );
    }

    const creditsEach =
      (await this.nodeCreditPriceService.getActiveCostCredit(
        SOCIAL_ACCOUNT_CONNECT_NODE_TYPE,
      )) ?? 0;
    if (creditsEach > 0) {
      const unlocked = await this.creditService.hasSocialChannelUnlock(
        userId,
        platform,
      );
      if (!unlocked) {
        throw new ForbiddenException(
          `Unlock "${platform}" before connecting your account`,
        );
      }
    }

    const connectUrl = await this.buildConnectUrl(platform, userId);
    return { connectUrl };
  }

  /** @deprecated Use `unlockChannel` then `connectChannel`. */
  async unlockChannelForConnect(
    platform: string,
    userId: string,
  ): Promise<{ connectUrl: string }> {
    await this.unlockChannel(platform, userId);
    return await this.connectChannel(platform, userId);
  }

  /** OAuth redirect URL only (no credit charge). Prefer `unlockChannelForConnect`. */
  async getConnectUrl(platform: string, userId: string): Promise<string> {
    return await this.buildConnectUrl(platform, userId);
  }

  private async buildConnectUrl(
    platform: string,
    userId: string,
  ): Promise<string> {
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
    const accounts = this.parseConnectedAccounts(raw, userId);
    await this.usersService.syncZernioConnectedAccounts(userId, accounts);
    return { accounts };
  }

  async getConnectedAccounts(userId: string): Promise<{
    accounts: ConnectedAccountRecord[];
    unlockedChannels: string[];
  }> {
    const accounts = await this.usersService.getZernioConnectedAccounts(userId);
    const unlockedChannels =
      await this.creditService.listUnlockedSocialChannels(userId);
    this.logger.log(
      `getConnectedAccounts accounts: jsons ${JSON.stringify(accounts)}`,
    );
    return { accounts, unlockedChannels };
  }

  async getConnectionCreditQuote(userId: string): Promise<{
    nodeType: typeof SOCIAL_ACCOUNT_CONNECT_NODE_TYPE;
    creditsEach: number;
    creditsRemaining: number;
  }> {
    const creditsEach =
      (await this.nodeCreditPriceService.getActiveCostCredit(
        SOCIAL_ACCOUNT_CONNECT_NODE_TYPE,
      )) ?? 0;
    const creditsRemaining = await this.creditService.getCreditsRemaining(userId);
    return {
      nodeType: SOCIAL_ACCOUNT_CONNECT_NODE_TYPE,
      creditsEach,
      creditsRemaining,
    };
  }

  async disconnectAccount(userId: string, channel: string): Promise<void> {
    const accounts = await this.usersService.getZernioConnectedAccounts(userId);
    const record = this.findConnectedAccountForDisconnect(accounts, channel);
    if (!record) {
      throw new NotFoundException(
        `No connected account for channel "${channel.trim()}"`,
      );
    }
    await this.zernioRest.deleteAccount(record.accountId);
    await this.usersService.disconnectZernioConnectedAccount(
      userId,
      record.channel,
    );
  }

  /** Resolve stored row when UI uses `twitter` vs Zernio storing `x` (or vice versa). */
  private isChannelConnected(
    accounts: ConnectedAccountRecord[],
    platform: string,
  ): boolean {
    return Boolean(this.findConnectedAccountForDisconnect(accounts, platform));
  }

  private findConnectedAccountForDisconnect(
    accounts: ConnectedAccountRecord[],
    requestChannel: string,
  ): ConnectedAccountRecord | undefined {
    const key = requestChannel.trim().toLowerCase();
    const keys =
      key === 'twitter' || key === 'x'
        ? new Set<string>(['twitter', 'x'])
        : new Set<string>([key]);
    return accounts.find((a) => keys.has(a.channel));
  }

  async publishCreatePostBatch(
    userId: string,
    payload: {
      platforms: Array<{
        platform: string;
        accountId: string;
        content: string;
        mediaUrl: string | null;
        mediaUrls?: string[] | null;
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
    scheduledFor?: string | null;
    title?: string;
    publishNow?: boolean;
    mediaUrls?: string[] | null;
  }): Promise<{ success: boolean }> {
    return await this.zernioRest.updatePost(payload);
  }

  async deleteZernioPost(zernioPostId: string): Promise<{ success: boolean }> {
    return await this.zernioRest.deletePost(zernioPostId);
  }

  async unpublishZernioPost(
    zernioPostId: string,
    platform: string,
  ): Promise<{ success: boolean; notSupported?: boolean }> {
    return await this.zernioRest.unpublishPost(zernioPostId, platform);
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

    try {
      const profiles = await this.zernio.listProfiles(true);
      const reused = pickZernioProfileForUser(profiles, name);
      if (reused?._id?.trim()) {
        const profileId = reused._id.trim();
        await this.usersService.setZernioProfileId(userId, profileId);
        this.logger.log(
          `Reused Zernio profile ${profileId} for user ${userId}`,
        );
        return profileId;
      }

      const profile = await this.zernio.createProfile(name);
      await this.usersService.setZernioProfileId(userId, profile._id);
      return profile._id;
    } catch (err: unknown) {
      if (err instanceof ZernioClientError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  private parseConnectedAccounts(
    raw: unknown,
    userId: string,
  ): ConnectedAccountRecord[] {
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
        userId,
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
