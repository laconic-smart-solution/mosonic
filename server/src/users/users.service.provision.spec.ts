import { BadRequestException } from '@nestjs/common';
import type { ModuleRef } from '@nestjs/core';
import {
  UserRole,
  UserStatus,
  type UserRecord,
} from '../domain/users/user.types';
import type { ISocialAccountRepository } from '../repositories/interfaces/social-account.repository.interface';
import type { IUserRepository } from '../repositories/interfaces/user.repository.interface';
import { UsersService } from './users.service';

function user(
  overrides: Partial<UserRecord> & Pick<UserRecord, 'userId'>,
): UserRecord {
  return {
    authServerUserId: 'sso-1',
    email: 'ada@example.com',
    username: 'ada',
    firstName: 'Ada',
    lastName: 'Lovelace',
    avatarUrl: null,
    role: UserRole.CUSTOMER,
    status: UserStatus.ACTIVE,
    lastLoginAt: null,
    zernioProfileId: null,
    zernioConnectedAccounts: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('UsersService.provisionForCompetitionEvent', () => {
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
    listActiveUserIds: jest.fn(),
    listWithZernioAccounts: jest.fn(),
    listForEmailDedupe: jest.fn(),
    findManyByUserIds: jest.fn(),
    searchAdmin: jest.fn(),
    listAdmin: jest.fn(),
    count: jest.fn(),
    findCreatedSince: jest.fn(),
  };

  const socialAccounts = {} as jest.Mocked<ISocialAccountRepository>;
  const service = new UsersService(users, socialAccounts, {} as ModuleRef);

  const args = {
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    username: 'ada',
    authServerUserId: 'sso-ada',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a customer when no Mosonic user matches', async () => {
    users.findByAuthServerUserId.mockResolvedValue(null);
    users.findByEmailOrUsernameInsensitive.mockResolvedValue(null);
    const created = user({ userId: 'new-1', authServerUserId: 'sso-ada' });
    users.create.mockResolvedValue(created);

    const result = await service.provisionForCompetitionEvent(args);

    expect(result.userId).toBe('new-1');
    expect(users.create).toHaveBeenCalledWith(
      expect.objectContaining({
        authServerUserId: 'sso-ada',
        email: 'ada@example.com',
        username: 'ada',
        firstName: 'Ada',
        lastName: 'Lovelace',
        role: UserRole.CUSTOMER,
      }),
    );
  });

  it('updates the matched user, not an unrelated key owner', async () => {
    const existing = user({ userId: 'captain-1', authServerUserId: 'sso-ada' });
    users.findByAuthServerUserId.mockResolvedValue(existing);
    users.findByEmailOrUsernameInsensitive.mockResolvedValue(existing);
    users.update.mockResolvedValue({
      ...existing,
      email: 'ada@example.com',
      username: 'ada',
    });

    const result = await service.provisionForCompetitionEvent(args);

    expect(result.userId).toBe('captain-1');
    expect(users.update).toHaveBeenCalledWith(
      'captain-1',
      expect.objectContaining({
        authServerUserId: 'sso-ada',
        email: 'ada@example.com',
        username: 'ada',
      }),
    );
    expect(users.create).not.toHaveBeenCalled();
  });

  it('finds by email when authServerUserId is omitted', async () => {
    const existing = user({ userId: 'email-1', authServerUserId: 'sso-old' });
    users.findByEmailOrUsernameInsensitive.mockResolvedValue(existing);
    users.update.mockResolvedValue(existing);

    const result = await service.provisionForCompetitionEvent({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      username: 'ada',
    });

    expect(users.findByAuthServerUserId).not.toHaveBeenCalled();
    expect(result.userId).toBe('email-1');
    expect(users.update).toHaveBeenCalledWith(
      'email-1',
      expect.not.objectContaining({ authServerUserId: expect.anything() }),
    );
  });

  it('rejects email/username owned by another user', async () => {
    const existing = user({ userId: 'captain-1', authServerUserId: 'sso-ada' });
    const clash = user({ userId: 'other-1', email: 'ada@example.com' });
    users.findByAuthServerUserId.mockResolvedValue(existing);
    users.findByEmailOrUsernameInsensitive.mockResolvedValue(clash);

    await expect(
      service.provisionForCompetitionEvent(args),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(users.update).not.toHaveBeenCalled();
  });

  it('creates when updateProfileForAuthServerUser finds no local user', async () => {
    users.findByUserId.mockResolvedValue(null);
    users.findByAuthServerUserId.mockResolvedValue(null);
    const created = user({ userId: 'new-2', authServerUserId: 'sso-ada' });
    users.create.mockResolvedValue(created);

    const result = await service.updateProfileForAuthServerUser({
      authServerUserId: 'sso-ada',
      localUserId: 'missing',
      email: 'ada@example.com',
      username: 'ada',
      firstName: 'Ada',
      lastName: 'Lovelace',
    });

    expect(result.userId).toBe('new-2');
    expect(users.create).toHaveBeenCalled();
    expect(users.update).not.toHaveBeenCalled();
  });
});
