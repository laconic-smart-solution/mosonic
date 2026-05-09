import { Injectable, Logger } from '@nestjs/common';
import { ZernioClient } from './zernio/zernio.client';
import { ZernioMcpClient } from './zernio/zernio.mcp';

const TEST_USER = {
  id: 'test-user-001',
  zernioProfileId: '',
  connectedAccounts: {
    facebook: '',
    instagram: '',
    linkedin: '',
  },
};

@Injectable()
export class McpService {
  private readonly logger = new Logger(McpService.name);

  constructor(
    private readonly zernio: ZernioClient,
    private readonly zernioMcp: ZernioMcpClient,
  ) {}

  async createTestProfile() {
    const profile = await this.zernio.createProfile('NeuralTex Test User');
    this.logger.log(`Profile created: ${profile._id}`);
    return profile;
  }

  async getConnectUrl(platform: string) {
    const profileId = TEST_USER.zernioProfileId;
    return await this.zernio.getConnectUrl(platform, profileId);
  }

  saveConnectedAccount(data: {
    platform: string;
    accountId: string;
    username: string;
  }) {
    this.logger.log(`Connected account: ${JSON.stringify(data)}`);
  }

  async publishContent(payload: {
    channels: string[];
    content: string;
    imageUrl?: string;
    videoUrl?: string;
    scheduledAt?: string;
  }) {
    const accountIds = payload.channels
      .map(
        (ch) =>
          TEST_USER.connectedAccounts[
            ch as keyof typeof TEST_USER.connectedAccounts
          ],
      )
      .filter(Boolean)
      .join(',');

    const mediaUrls = [payload.imageUrl, payload.videoUrl]
      .filter((u): u is string => Boolean(u?.trim()))
      .join(',');

    return await this.zernioMcp.publishPost({
      profileId: TEST_USER.zernioProfileId,
      platforms: payload.channels.join(','),
      accountIds,
      content: payload.content,
      mediaUrls: mediaUrls || undefined,
      scheduledAt: payload.scheduledAt,
    });
  }

  async getAnalytics(postId: string) {
    return await this.zernioMcp.getPostAnalytics(postId);
  }

  async listMcpTools() {
    return await this.zernioMcp.listTools();
  }
}
