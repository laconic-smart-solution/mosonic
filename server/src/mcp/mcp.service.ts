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
  buildZernioProfileNameForUser,
  ZernioClient,
  ZernioClientError,
} from './zernio/zernio.client';
import { ZernioMcpClient } from './zernio/zernio.mcp';
import { ZernioRestClient } from './zernio/zernio-rest.client';
import { ZernioOauthStateService } from './zernio-oauth-state.service';
import { isDeprecatedChannelId } from '../workflow/distribution-channels.util';

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
    const channel = platform.trim().toLowerCase();
    if (isDeprecatedChannelId(channel)) {
      throw new BadRequestException(`Publishing channel "${platform}" is not supported`);
    }
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
    const channel = platform.trim().toLowerCase();
    if (isDeprecatedChannelId(channel)) {
      throw new BadRequestException(`Publishing channel "${platform}" is not supported`);
    }
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
    /** Zernio standard redirect uses `connected={platform}`, not `platform`. */
    connected?: string;
    accountId?: string;
    account_id?: string;
    username?: string;
  }): Promise<{ platform: string }> {
    const state = query.state;
    if (!state?.trim()) {
      throw new BadRequestException('Missing OAuth state');
    }
    const { userId } = await this.oauthState.verifyState(state);

    // Zernio docs: standard redirect appends connected, profileId, accountId, username.
    const platform = (
      query.platform?.trim() ||
      query.connected?.trim() ||
      ''
    ).toLowerCase();
    const accountId =
      query.accountId?.trim() || query.account_id?.trim() || '';
    const username = query.username?.trim() || undefined;

    if (platform && accountId) {
      await this.usersService.setZernioConnectedAccount(
        userId,
        platform,
        accountId,
        username ? { username } : undefined,
      );
    } else {
      this.logger.warn(
        `Zernio OAuth callback missing platform/accountId for user=${userId} keys=${Object.keys(query).join(',')}; falling back to account sync`,
      );
    }

    try {
      await this.syncAccounts(userId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      // Account may still be saved locally from setZernioConnectedAccount above.
      this.logger.warn(
        `Zernio account sync skipped after callback for ${userId}: ${message}`,
      );
      if (!platform || !accountId) {
        throw new BadRequestException(
          'OAuth completed but account details were missing and sync failed',
        );
      }
    }

    const resolvedPlatform = platform || query.connected?.trim() || 'account';
    this.logger.log(
      `Zernio OAuth saved ${resolvedPlatform} for user ${userId} (${username ?? ''})`,
    );
    return { platform: resolvedPlatform };
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
    const accounts = (
      await this.usersService.getAllActiveConnectedAccounts(userId)
    ).filter((a) => !isDeprecatedChannelId(a.channel));
    const unlockedChannels = (
      await this.creditService.listUnlockedSocialChannels(userId)
    ).filter((ch) => !isDeprecatedChannelId(ch));
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
    if (isDeprecatedChannelId(key)) return undefined;
    return accounts.find((a) => a.channel === key);
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
      const otherOwner =
        await this.usersService.findOtherUserByZernioProfileId(
          existing,
          userId,
        );
      if (!otherOwner) {
        return existing;
      }
      this.logger.warn(
        `User ${userId} had shared Zernio profile ${existing} (also assigned to ${otherOwner.userId}); provisioning a dedicated profile`,
      );
    }

    try {
      const profile = await this.createDedicatedZernioProfile(userId);
      await this.usersService.setZernioProfileId(userId, profile._id);
      this.logger.log(
        `Created dedicated Zernio profile ${profile._id} for user ${userId}`,
      );
      return profile._id;
    } catch (err: unknown) {
      if (err instanceof ZernioClientError) {
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  private async createDedicatedZernioProfile(userId: string) {
    const baseName = buildZernioProfileNameForUser(userId);
    try {
      return await this.zernio.createProfile(baseName);
    } catch (err: unknown) {
      if (!(err instanceof ZernioClientError)) {
        throw err;
      }
      const fallbackName = `${baseName}:${Date.now()}`;
      this.logger.warn(
        `Zernio createProfile failed for ${baseName}; retrying as ${fallbackName}`,
      );
      return await this.zernio.createProfile(fallbackName);
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
      const username = this.readFirstString(record, [
        'username',
        'userName',
        'handle',
        'screenName',
        'screen_name',
      ]);
      const displayName = this.readFirstString(record, [
        'displayName',
        'display_name',
        'name',
        'fullName',
        'full_name',
      ]);
      byChannel.set(channel, {
        userId,
        channel,
        accountId,
        connectedAt: new Date(),
        ...(username ? { username } : {}),
        ...(displayName ? { displayName } : {}),
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
