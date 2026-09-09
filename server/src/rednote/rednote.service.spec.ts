import { ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { ModuleRef } from '@nestjs/core';
import type { UsersService } from '../users/users.service';
import { RedNoteService } from './rednote.service';
import type { RedNoteAdapter } from './adapters/rednote.adapter';
import type { RedNoteGateway } from './rednote.gateway';
import type { RedNoteLockService } from './rednote-lock.service';

jest.mock('jose', () => ({
  SignJWT: class SignJWT {},
  jwtVerify: jest.fn(),
}));

jest.mock('puppeteer', () => ({}));

describe('RedNoteService.startConnect', () => {
  const users = {} as unknown as jest.Mocked<UsersService>;
  const locks = {
    isHeld: jest.fn().mockResolvedValue(false),
    release: jest.fn(),
  } as unknown as jest.Mocked<RedNoteLockService>;
  const gateway = {} as unknown as jest.Mocked<RedNoteGateway>;
  const adapter = {} as unknown as jest.Mocked<RedNoteAdapter>;
  const config = {} as ConfigService;
  const planChannelAccess = {
    isChannelAllowed: jest.fn().mockResolvedValue(true),
  };
  const moduleRef = {
    get: jest.fn().mockReturnValue(planChannelAccess),
  } as unknown as jest.Mocked<ModuleRef>;
  const loginQueue = {
    getJob: jest.fn().mockResolvedValue(undefined),
    add: jest.fn().mockResolvedValue(undefined),
  };
  const publishQueue = {};

  const service = new RedNoteService(
    users,
    moduleRef,
    locks,
    gateway,
    adapter,
    config,
    loginQueue as never,
    publishQueue as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    locks.isHeld.mockResolvedValue(false);
    loginQueue.getJob.mockResolvedValue(undefined);
    planChannelAccess.isChannelAllowed.mockResolvedValue(true);
  });

  it('throws when the current plan does not include RedNote', async () => {
    planChannelAccess.isChannelAllowed.mockResolvedValue(false);

    await expect(service.startConnect('u1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(loginQueue.add).not.toHaveBeenCalled();
  });

  it('enqueues a login job when the plan includes RedNote', async () => {
    const result = await service.startConnect('u1');

    expect(planChannelAccess.isChannelAllowed).toHaveBeenCalledWith(
      'u1',
      'rednote',
    );
    expect(loginQueue.add).toHaveBeenCalledTimes(1);
    expect(result.socketRoom).toEqual(expect.any(String));
  });
});
