import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { ModuleRef } from '@nestjs/core';
import type { UsersService } from '../users/users.service';
import { McpService } from './mcp.service';
import { buildZernioProfileNameForUser } from './zernio/zernio.client';
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
    createProfile: jest.fn(),
  } as unknown as jest.Mocked<ZernioClient>;
  const zernioMcp = {} as unknown as jest.Mocked<ZernioMcpClient>;
  const zernioRest = {
    publishCreatePost: jest.fn(),
    deleteAccount: jest.fn(),
  } as unknown as jest.Mocked<
    Pick<ZernioRestClient, 'publishCreatePost' | 'deleteAccount'>
  >;
  const usersService = {
    getZernioPublishContext: jest.fn(),
    syncZernioConnectedAccounts: jest.fn(),
    findByUserId: jest.fn(),
    findOtherUserByZernioProfileId: jest.fn(),
    getZernioConnectedAccounts: jest.fn(),
    disconnectZernioConnectedAccount: jest.fn(),
    setZernioProfileId: jest.fn(),
    setZernioConnectedAccount: jest.fn(),
  } as unknown as jest.Mocked<UsersService>;
  const oauthState = {
    verifyState: jest.fn(),
  } as unknown as jest.Mocked<ZernioOauthStateService>;
  const config = {} as ConfigService;
  const planChannelAccess = {
    isChannelAllowed: jest.fn().mockResolvedValue(true),
  };
  const moduleRef = {
    get: jest.fn().mockReturnValue(planChannelAccess),
  } as unknown as jest.Mocked<ModuleRef>;

  const service = new McpService(
    zernio,
    zernioMcp,
    zernioRest as unknown as ZernioRestClient,
    usersService,
    oauthState,
    config,
    moduleRef,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    usersService.findOtherUserByZernioProfileId.mockResolvedValue(null);
  });

  it('connectChannel throws when the current plan does not include the channel', async () => {
    usersService.getZernioConnectedAccounts.mockResolvedValue([]);
    planChannelAccess.isChannelAllowed.mockResolvedValue(false);

    await expect(
      service.connectChannel('instagram', 'u1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(planChannelAccess.isChannelAllowed).toHaveBeenCalledWith(
      'u1',
      'instagram',
    );
  });

  it('connectChannel throws when the channel is already connected, before checking plan access', async () => {
    usersService.getZernioConnectedAccounts.mockResolvedValue([
      { channel: 'instagram', accountId: 'acc_ig', connectedAt: new Date() },
    ]);

    await expect(
      service.connectChannel('instagram', 'u1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(planChannelAccess.isChannelAllowed).not.toHaveBeenCalled();
  });

  it('syncAccounts creates a dedicated Zernio profile when none is stored locally', async () => {
    usersService.findByUserId.mockResolvedValue({
      userId: 'u1',
      email: 'user@example.com',
    } as never);
    zernio.createProfile.mockResolvedValue({
      _id: 'prof_new',
      name: buildZernioProfileNameForUser('u1'),
    });
    zernio.listAccounts.mockResolvedValue([]);

    await service.syncAccounts('u1');

    expect(zernio.createProfile).toHaveBeenCalledWith(
      buildZernioProfileNameForUser('u1'),
    );
    expect(usersService.setZernioProfileId).toHaveBeenCalledWith(
      'u1',
      'prof_new',
    );
    expect(zernio.listAccounts).toHaveBeenCalledWith('prof_new');
  });

  it('syncAccounts reprovisions when stored profile is owned by another user', async () => {
    usersService.findByUserId.mockResolvedValue({
      userId: 'u2',
      zernioProfileId: 'prof_shared',
    } as never);
    usersService.findOtherUserByZernioProfileId.mockResolvedValue({
      userId: 'u1',
    } as never);
    zernio.createProfile.mockResolvedValue({
      _id: 'prof_u2',
      name: buildZernioProfileNameForUser('u2'),
    });
    zernio.listAccounts.mockResolvedValue([]);

    await service.syncAccounts('u2');

    expect(zernio.createProfile).toHaveBeenCalledWith(
      buildZernioProfileNameForUser('u2'),
    );
    expect(usersService.setZernioProfileId).toHaveBeenCalledWith(
      'u2',
      'prof_u2',
    );
  });

  it('syncAccounts keeps exclusive profile without creating a new one', async () => {
    usersService.findByUserId.mockResolvedValue({
      userId: 'u1',
      zernioProfileId: 'prof_1',
    } as never);
    zernio.listAccounts.mockResolvedValue([]);

    await service.syncAccounts('u1');

    expect(zernio.createProfile).not.toHaveBeenCalled();
    expect(usersService.setZernioProfileId).not.toHaveBeenCalled();
    expect(zernio.listAccounts).toHaveBeenCalledWith('prof_1');
  });

  it('syncAccounts normalizes channels/accounts and deduplicates by channel', async () => {
    usersService.findByUserId.mockResolvedValue({
      userId: 'u1',
      zernioProfileId: 'prof_1',
    } as never);
    zernio.listAccounts.mockResolvedValue([
      { platform: 'Instagram', account_id: 'acc_1' },
      {
        channel: 'instagram',
        accountId: 'acc_2',
        username: 'ig_user',
        displayName: 'IG Name',
      },
      { platform: 'facebook', id: 'fb_1', name: 'Page One' },
      { platform: '', account_id: 'bad' },
    ]);

    await service.syncAccounts('u1');

    expect(usersService.syncZernioConnectedAccounts).toHaveBeenCalledWith(
      'u1',
      expect.arrayContaining([
        expect.objectContaining({
          channel: 'instagram',
          accountId: 'acc_2',
          username: 'ig_user',
          displayName: 'IG Name',
        }),
        expect.objectContaining({
          channel: 'facebook',
          accountId: 'fb_1',
          displayName: 'Page One',
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
    });

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

  it('disconnectAccount calls Zernio DELETE then removes local row', async () => {
    usersService.getZernioConnectedAccounts.mockResolvedValue([
      { channel: 'instagram', accountId: 'acc_ig', connectedAt: new Date() },
    ]);
    zernioRest.deleteAccount.mockResolvedValue(undefined);

    await service.disconnectAccount('u1', 'instagram');

    expect(zernioRest.deleteAccount).toHaveBeenCalledWith('acc_ig');
    expect(usersService.disconnectZernioConnectedAccount).toHaveBeenCalledWith(
      'u1',
      'instagram',
    );
  });

  it('disconnectAccount throws when channel is not connected', async () => {
    usersService.getZernioConnectedAccounts.mockResolvedValue([]);

    await expect(
      service.disconnectAccount('u1', 'linkedin'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(zernioRest.deleteAccount).not.toHaveBeenCalled();
  });

  it('handleOAuthCallback accepts Zernio connected + accountId redirect params', async () => {
    oauthState.verifyState.mockResolvedValue({ userId: 'u1' });
    usersService.findByUserId.mockResolvedValue({
      userId: 'u1',
      zernioProfileId: 'prof_1',
      email: 'user@example.com',
    } as never);
    usersService.findOtherUserByZernioProfileId.mockResolvedValue(null);
    zernio.listAccounts.mockResolvedValue([
      {
        _id: 'acc_ig',
        platform: 'instagram',
        username: 'brand',
      },
    ]);
    usersService.syncZernioConnectedAccounts.mockResolvedValue([
      {
        channel: 'instagram',
        accountId: 'acc_ig',
        handle: 'brand',
        connectedAt: new Date(),
      },
    ] as never);

    const result = await service.handleOAuthCallback({
      state: 'signed-state',
      connected: 'instagram',
      accountId: 'acc_ig',
      username: 'brand',
    });

    expect(usersService.setZernioConnectedAccount).toHaveBeenCalledWith(
      'u1',
      'instagram',
      'acc_ig',
      { username: 'brand' },
    );
    expect(result).toEqual({ platform: 'instagram' });
  });

  it('handleOAuthCallback still succeeds when sync fails but account params exist', async () => {
    oauthState.verifyState.mockResolvedValue({ userId: 'u1' });
    usersService.findByUserId.mockResolvedValue({
      userId: 'u1',
      zernioProfileId: 'prof_1',
      email: 'user@example.com',
    } as never);
    usersService.findOtherUserByZernioProfileId.mockResolvedValue(null);
    zernio.listAccounts.mockRejectedValue(new Error('zernio unavailable'));

    const result = await service.handleOAuthCallback({
      state: 'signed-state',
      connected: 'linkedin',
      accountId: 'acc_li',
    });

    expect(usersService.setZernioConnectedAccount).toHaveBeenCalledWith(
      'u1',
      'linkedin',
      'acc_li',
      undefined,
    );
    expect(result).toEqual({ platform: 'linkedin' });
  });
});
