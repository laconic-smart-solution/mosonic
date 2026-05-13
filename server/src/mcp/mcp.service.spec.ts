import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { UsersService } from '../users/users.service';
import { McpService } from './mcp.service';
import type { ZernioClient } from './zernio/zernio.client';
import type { ZernioMcpClient } from './zernio/zernio.mcp';
import type { ZernioRestClient } from './zernio/zernio-rest.client';
import type { ZernioOauthStateService } from './zernio-oauth-state.service';

jest.mock('jose', () => ({
  SignJWT: class SignJWT {},
  jwtVerify: jest.fn(),
}));

describe('McpService', () => {
  const zernio = {
    listAccounts: jest.fn(),
  } as unknown as jest.Mocked<ZernioClient>;
  const zernioMcp = {} as unknown as jest.Mocked<ZernioMcpClient>;
  const zernioRest = {
    publishCreatePost: jest.fn(),
  } as unknown as jest.Mocked<Pick<ZernioRestClient, 'publishCreatePost'>>;
  const usersService = {
    getZernioPublishContext: jest.fn(),
    syncZernioConnectedAccounts: jest.fn(),
    findByUserId: jest.fn(),
  } as unknown as jest.Mocked<UsersService>;
  const oauthState = {} as ZernioOauthStateService;
  const config = {} as ConfigService;

  const service = new McpService(
    zernio,
    zernioMcp,
    zernioRest as unknown as ZernioRestClient,
    usersService,
    oauthState,
    config,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('syncAccounts normalizes channels/accounts and deduplicates by channel', async () => {
    usersService.findByUserId.mockResolvedValue({
      userId: 'u1',
      zernioProfileId: 'prof_1',
    } as never);
    zernio.listAccounts.mockResolvedValue([
      { platform: 'Instagram', account_id: 'acc_1' },
      { channel: 'instagram', accountId: 'acc_2' },
      { platform: 'facebook', id: 'fb_1' },
      { platform: '', account_id: 'bad' },
    ]);

    await service.syncAccounts('u1');

    expect(usersService.syncZernioConnectedAccounts).toHaveBeenCalledWith(
      'u1',
      expect.arrayContaining([
        expect.objectContaining({
          channel: 'instagram',
          accountId: 'acc_2',
        }),
        expect.objectContaining({
          channel: 'facebook',
          accountId: 'fb_1',
        }),
      ]),
    );
  });

  it('publishContent fails when any selected channel is missing', async () => {
    usersService.getZernioPublishContext.mockResolvedValue({
      profileId: 'prof_1',
      accounts: { instagram: 'acc_1' },
    });

    await expect(
      service.publishContent('u1', {
        channels: ['instagram', 'linkedin'],
        content: 'hello',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('publishContent maps normalized channels to REST publishCreatePost', async () => {
    usersService.getZernioPublishContext.mockResolvedValue({
      profileId: 'prof_1',
      accounts: { instagram: 'acc_ig', linkedin: 'acc_li' },
    });
    zernioRest.publishCreatePost.mockResolvedValue({
      postId: 'post_1',
      raw: {},
    } as never);

    await service.publishContent('u1', {
      channels: ['Instagram', ' linkedin '],
      content: 'hello',
    });

    expect(zernioRest.publishCreatePost).toHaveBeenCalledWith({
      profileId: 'prof_1',
      platforms: [
        {
          platform: 'instagram',
          accountId: 'acc_ig',
          content: 'hello',
          mediaUrl: null,
        },
        {
          platform: 'linkedin',
          accountId: 'acc_li',
          content: 'hello',
          mediaUrl: null,
        },
      ],
      publishNow: true,
      scheduledAt: null,
    });
  });
});

