// The real guard pulls in `jose`, which ships ESM that jest's transform rejects.
jest.mock('../auth/jwt-auth.guard', () => ({
  JwtAuthGuard: class {
    canActivate() {
      return true;
    }
  },
}));
jest.mock('../orchestration/orchestration.service', () => ({
  OrchestrationService: class OrchestrationService {},
}));

import {
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { UserRole, UserStatus } from '../domain/users/user.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from '../users/users.service';
import { ApiKeyOrJwtGuard } from './api-key-or-jwt.guard';
import { IntegrationsService } from './integrations.service';

function mockContext(headers: Record<string, string | undefined>) {
  const req = {
    method: 'POST',
    originalUrl: '/integrations/v1/competition-event/users/provision',
    headers,
  } as unknown as Request;
  const context = {
    switchToHttp: () => ({ getRequest: () => req }),
  } as ExecutionContext;
  return { context, req };
}

describe('ApiKeyOrJwtGuard', () => {
  const jwt = { canActivate: jest.fn() } as unknown as jest.Mocked<JwtAuthGuard>;
  const integrations = {
    validateApiKey: jest.fn(),
  } as unknown as jest.Mocked<Pick<IntegrationsService, 'validateApiKey'>>;
  const users = {
    findByUserId: jest.fn(),
  } as unknown as jest.Mocked<Pick<UsersService, 'findByUserId'>>;

  const guard = new ApiKeyOrJwtGuard(
    jwt,
    integrations as unknown as IntegrationsService,
    users as unknown as UsersService,
  );

  const keyOwner = {
    userId: 'key-owner',
    authServerUserId: 'sso-owner',
    email: 'owner@example.com',
    username: 'owner',
    firstName: 'Key',
    lastName: 'Owner',
    role: UserRole.CUSTOMER,
    status: UserStatus.ACTIVE,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('falls back to JWT when X-Api-Key is missing', async () => {
    jwt.canActivate.mockResolvedValue(true);
    const { context } = mockContext({});
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(jwt.canActivate).toHaveBeenCalledWith(context);
    expect(integrations.validateApiKey).not.toHaveBeenCalled();
  });

  it('rejects an invalid API key', async () => {
    integrations.validateApiKey.mockResolvedValue(null);
    const { context } = mockContext({ 'x-api-key': 'ntx_bad' });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(jwt.canActivate).not.toHaveBeenCalled();
  });

  it('rejects a key missing competition-event scope', async () => {
    integrations.validateApiKey.mockResolvedValue({
      keyId: 'k1',
      userId: 'key-owner',
      name: 'pipeline',
      keyHash: 'hash',
      scopes: ['pipeline:start'],
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const { context } = mockContext({ 'x-api-key': 'ntx_ok' });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('authenticates as the key owner, not a request body user', async () => {
    integrations.validateApiKey.mockResolvedValue({
      keyId: 'k1',
      userId: 'key-owner',
      name: 'competition-event',
      keyHash: 'hash',
      scopes: ['competition-event'],
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    users.findByUserId.mockResolvedValue(keyOwner as never);
    const { context, req } = mockContext({ 'x-api-key': 'ntx_ok' });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(req.auth?.localUser?.userId).toBe('key-owner');
    expect(jwt.canActivate).not.toHaveBeenCalled();
  });
});
