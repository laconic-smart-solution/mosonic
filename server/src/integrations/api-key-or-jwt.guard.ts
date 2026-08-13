import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserStatus } from '../domain/users/user.types';
import { UsersService } from '../users/users.service';
import {
  COMPETITION_EVENT_API_SCOPE,
  IntegrationsService,
} from './integrations.service';

@Injectable()
export class ApiKeyOrJwtGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtAuthGuard,
    private readonly integrations: IntegrationsService,
    private readonly users: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const rawKey = readApiKey(req);
    if (!rawKey) {
      return this.jwt.canActivate(context);
    }

    const key = await this.integrations.validateApiKey(rawKey);
    if (!key) {
      throw new UnauthorizedException('Invalid API key');
    }
    if (!key.scopes.includes(COMPETITION_EVENT_API_SCOPE)) {
      throw new ForbiddenException(
        `API key missing ${COMPETITION_EVENT_API_SCOPE} scope`,
      );
    }

    const localUser = await this.users.findByUserId(key.userId);
    if (!localUser) {
      throw new UnauthorizedException('API key owner not found');
    }
    if (localUser.status === UserStatus.DISABLED) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'AccountSuspended',
        message: 'Your account has been suspended. Please contact support.',
      });
    }

    req.auth = {
      claims: {
        sub: localUser.authServerUserId,
        userid: localUser.authServerUserId,
        email: localUser.email ?? undefined,
        preferred_username: localUser.username ?? undefined,
      },
      authServerUserId: localUser.authServerUserId,
      localUser,
    };
    return true;
  }
}

function readApiKey(req: Request): string | null {
  const header = req.headers['x-api-key'];
  const raw = Array.isArray(header) ? header[0] : header;
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  return trimmed || null;
}
