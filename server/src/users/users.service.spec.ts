import { NotFoundException } from '@nestjs/common';
import { SocialProvider } from '@prisma/client';
import type { ModuleRef } from '@nestjs/core';
import type { ISocialAccountRepository } from '../repositories/interfaces/social-account.repository.interface';
import type { IUserRepository } from '../repositories/interfaces/user.repository.interface';
import { UsersService } from './users.service';

function activeRow(overrides: {
  channel: string;
  externalAccountId: string;
  connectedAt?: Date;
}) {
  return {
    id: `sa_${overrides.channel}`,
    userId: 'u1',
    provider: SocialProvider.ZERNIO,
    channel: overrides.channel,
    externalAccountId: overrides.externalAccountId,
    displayName: null,
    username: null,
    avatarUrl: null,
    status: 'ACTIVE' as const,
    metadata: null,
    connectedAt: overrides.connectedAt ?? new Date('2026-01-01'),
    disconnectedAt: null,
    lastSyncedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('UsersService Zernio accounts', () => {
  const users: jest.Mocked<IUserRepository> = {
    findByUserId: jest.fn(),
    findByAuthServerUserId: jest.fn(),
    findByZernioProfileId: jest.fn(),
    findOtherUserByZernioProfileId: jest.fn(),
    listDuplicateZernioProfileGroups: jest.fn(),
    findByEmailOrUsernameInsensitive: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateManyByAuthServerUserIds: jest.fn(),
    deleteByUserId: jest.fn(),
    listAllUserIds: jest.fn(),
    listWithZernioAccounts: jest.fn(),
    listForEmailDedupe: jest.fn(),
    findManyByUserIds: jest.fn(),
    searchAdmin: jest.fn(),
    listAdmin: jest.fn(),
    count: jest.fn(),
    findCreatedSince: jest.fn(),
  };

  const socialAccounts: jest.Mocked<ISocialAccountRepository> = {
    findActiveByUserId: jest.fn(),
    findActiveByUserAndProvider: jest.fn(),
    findActiveByUserProviderChannel: jest.fn(),
    upsertActive: jest.fn(),
    syncActiveForProvider: jest.fn(),
    markDisconnected: jest.fn(),
    markAllDisconnectedForProvider: jest.fn(),
    countActiveByUserGrouped: jest.fn(),
    countActive: jest.fn(),
    hasAnyForUser: jest.fn(),
    hasAnyRows: jest.fn(),
  };

  const moduleRef = {} as ModuleRef;
  const service = new UsersService(users, socialAccounts, moduleRef);

  const userRow = {
    userId: 'u1',
    zernioProfileId: 'prof_1',
    zernioConnectedAccounts: [] as unknown,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    users.findByUserId.mockResolvedValue(userRow as never);
    users.update.mockResolvedValue(userRow as never);
    socialAccounts.hasAnyForUser.mockResolvedValue(false);
    socialAccounts.hasAnyRows.mockResolvedValue(false);
    socialAccounts.findActiveByUserAndProvider.mockResolvedValue([]);
  });

  it('getZernioPublishContext prefers social_accounts table', async () => {
    socialAccounts.findActiveByUserAndProvider.mockResolvedValue([
      activeRow({ channel: 'instagram', externalAccountId: 'acc_ig' }),
    ] as never);

    const ctx = await service.getZernioPublishContext('u1');

    expect(ctx.profileId).toBe('prof_1');
    expect(ctx.accounts).toEqual({ instagram: 'acc_ig' });
    expect(socialAccounts.findActiveByUserAndProvider).toHaveBeenCalledWith(
      'u1',
      SocialProvider.ZERNIO,
    );
  });

  it('getZernioPublishContext falls back to legacy JSON map when table empty', async () => {
    users.findByUserId.mockResolvedValue({
      ...userRow,
      zernioConnectedAccounts: {
        Instagram: 'acc_ig',
        linkedin: 'acc_li',
      },
    } as never);
    socialAccounts.findActiveByUserAndProvider.mockResolvedValue([]);
    socialAccounts.hasAnyForUser.mockResolvedValue(false);

    const ctx = await service.getZernioPublishContext('u1');

    expect(ctx.profileId).toBe('prof_1');
    expect(ctx.accounts).toEqual({
      instagram: 'acc_ig',
      linkedin: 'acc_li',
    });
  });

  it('getZernioConnectedAccounts does not fall back to JSON after disconnect', async () => {
    users.findByUserId.mockResolvedValue({
      ...userRow,
      zernioConnectedAccounts: [{ channel: 'instagram', accountId: 'stale' }],
    } as never);
    socialAccounts.findActiveByUserAndProvider.mockResolvedValue([]);
    socialAccounts.hasAnyForUser.mockResolvedValue(true);

    await expect(service.getZernioConnectedAccounts('u1')).resolves.toEqual([]);
  });

  it('setZernioConnectedAccount upserts table and dual-writes JSON', async () => {
    socialAccounts.upsertActive.mockResolvedValue(activeRow({
      channel: 'instagram',
      externalAccountId: 'acc_new',
    }) as never);
    socialAccounts.findActiveByUserAndProvider.mockResolvedValue([
      activeRow({ channel: 'instagram', externalAccountId: 'acc_new' }),
    ] as never);
    socialAccounts.hasAnyForUser.mockResolvedValue(true);

    await service.setZernioConnectedAccount('u1', 'Instagram', 'acc_new');

    expect(socialAccounts.upsertActive).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        provider: SocialProvider.ZERNIO,
        channel: 'instagram',
        externalAccountId: 'acc_new',
      }),
    );
    expect(users.update).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({
        zernioConnectedAccounts: expect.arrayContaining([
          expect.objectContaining({
            channel: 'instagram',
            accountId: 'acc_new',
          }),
        ]),
      }),
    );
  });

  it('disconnectZernioConnectedAccount throws if user missing', async () => {
    users.findByUserId.mockResolvedValueOnce(null);

    await expect(
      service.disconnectZernioConnectedAccount('missing', 'instagram'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('disconnectZernioConnectedAccount marks table row disconnected', async () => {
    socialAccounts.markDisconnected.mockResolvedValue({} as never);
    socialAccounts.findActiveByUserAndProvider.mockResolvedValue([]);
    socialAccounts.hasAnyForUser.mockResolvedValue(true);

    await service.disconnectZernioConnectedAccount('u1', 'instagram');

    expect(socialAccounts.markDisconnected).toHaveBeenCalledWith(
      'u1',
      SocialProvider.ZERNIO,
      'instagram',
    );
    expect(users.update).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ zernioConnectedAccounts: [] }),
    );
  });
});
