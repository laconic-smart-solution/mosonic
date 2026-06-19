import { NotFoundException } from '@nestjs/common';
import type { ModuleRef } from '@nestjs/core';
import type { IUserRepository } from '../repositories/interfaces/user.repository.interface';
import { UsersService } from './users.service';

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
  };
  const moduleRef = {} as ModuleRef;
  const service = new UsersService(users, moduleRef);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getZernioPublishContext normalizes legacy map accounts', async () => {
    users.findByUserId.mockResolvedValueOnce({
      userId: 'u1',
      zernioProfileId: 'prof_1',
      zernioConnectedAccounts: {
        Instagram: 'acc_ig',
        linkedin: 'acc_li',
      },
    } as never);

    const ctx = await service.getZernioPublishContext('u1');

    expect(ctx.profileId).toBe('prof_1');
    expect(ctx.accounts).toEqual({
      instagram: 'acc_ig',
      linkedin: 'acc_li',
    });
  });

  it('setZernioConnectedAccount stores array records', async () => {
    users.findByUserId.mockResolvedValueOnce({
      userId: 'u1',
      zernioConnectedAccounts: { instagram: 'acc_old' },
    } as never);
    users.update.mockResolvedValueOnce({ userId: 'u1' } as never);

    await service.setZernioConnectedAccount('u1', 'Instagram', 'acc_new');

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
});
