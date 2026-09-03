import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '../domain/users/user.types';
import type { IUserRepository } from '../repositories/interfaces/user.repository.interface';
import { USER_REPOSITORY } from '../repositories/tokens';

@Injectable()
export class UsersBootstrap implements OnModuleInit {
  private readonly log = new Logger(UsersBootstrap.name);

  constructor(
    private readonly config: ConfigService,
    @Inject(USER_REPOSITORY) private readonly users: IUserRepository,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedDefaultAdmin();

    const raw = this.config
      .get<string>('ADMIN_BOOTSTRAP_AUTH_SERVER_USER_IDS')
      ?.trim();
    if (!raw) return;

    const ids = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.length === 0) return;

    const modifiedCount = await this.users.updateManyByAuthServerUserIds(ids, {
      role: UserRole.ADMIN,
    });
    this.log.log(`Bootstrapped ADMIN role for ${modifiedCount} user(s).`);
  }

  private async seedDefaultAdmin(): Promise<void> {
    const enabled =
      (this.config.get<string>('DEFAULT_ADMIN_ENABLED') ?? 'false')
        .trim()
        .toLowerCase() === 'true';
    if (!enabled) return;

    const authServerUserId = this.config
      .get<string>('DEFAULT_ADMIN_AUTH_SERVER_USER_ID')
      ?.trim();
    const username = this.config.get<string>('DEFAULT_ADMIN_USERNAME')?.trim();
    const email = this.config.get<string>('DEFAULT_ADMIN_EMAIL')?.trim();
    const firstName = this.config
      .get<string>('DEFAULT_ADMIN_FIRST_NAME')
      ?.trim();
    const lastName = this.config.get<string>('DEFAULT_ADMIN_LAST_NAME')?.trim();

    if (!authServerUserId) {
      this.log.warn(
        'DEFAULT_ADMIN_ENABLED=true but DEFAULT_ADMIN_AUTH_SERVER_USER_ID is not set; skipping seed.',
      );
      return;
    }

    const existing = await this.users.findByAuthServerUserId(authServerUserId);

    if (existing) {
      await this.users.update(existing.userId, {
        role: UserRole.ADMIN,
        ...(username ? { username } : {}),
        ...(email ? { email } : {}),
        ...(firstName ? { firstName } : {}),
        ...(lastName ? { lastName } : {}),
      });
      this.log.log(
        `Default admin ensured (existing): authServerUserId=${authServerUserId}`,
      );
      return;
    }

    await this.users.create({
      authServerUserId,
      username: username || 'admin',
      email,
      firstName,
      lastName,
      role: UserRole.ADMIN,
    });

    this.log.log(`Default admin created: authServerUserId=${authServerUserId}`);
  }
}
