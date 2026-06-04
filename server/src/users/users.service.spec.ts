import { NotFoundException } from '@nestjs/common';
import type { Model } from 'mongoose';
import { UsersService } from './users.service';
import type { UserDocument } from './schemas/user.schema';

describe('UsersService Zernio accounts', () => {
  const findOne = jest.fn();
  const updateOne = jest.fn();
  const model = {
    findOne,
    updateOne,
  } as unknown as Model<UserDocument>;
  const service = new UsersService(model);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getZernioPublishContext normalizes legacy map accounts', async () => {
    findOne.mockReturnValueOnce({
      exec: async () => ({
        userId: 'u1',
        zernioProfileId: 'prof_1',
        zernioConnectedAccounts: {
          Instagram: 'acc_ig',
          linkedin: 'acc_li',
        },
      }),
    });

    const ctx = await service.getZernioPublishContext('u1');

    expect(ctx.profileId).toBe('prof_1');
    expect(ctx.accounts).toEqual({
      instagram: 'acc_ig',
      linkedin: 'acc_li',
    });
  });

  it('setZernioConnectedAccount stores array records', async () => {
    findOne.mockReturnValueOnce({
      exec: async () => ({
        userId: 'u1',
        zernioConnectedAccounts: { instagram: 'acc_old' },
      }),
    });
    updateOne.mockReturnValueOnce({
      exec: async () => ({ matchedCount: 1 }),
    });

    await service.setZernioConnectedAccount('u1', 'Instagram', 'acc_new');

    expect(updateOne).toHaveBeenCalledWith(
      { userId: 'u1' },
      expect.objectContaining({
        $set: expect.objectContaining({
          zernioConnectedAccounts: expect.arrayContaining([
            expect.objectContaining({
              channel: 'instagram',
              accountId: 'acc_new',
            }),
          ]),
        }),
      }),
    );
  });

  it('disconnectZernioConnectedAccount throws if user missing', async () => {
    findOne.mockReturnValueOnce({
      exec: async () => null,
    });

    await expect(
      service.disconnectZernioConnectedAccount('missing', 'instagram'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

