import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { SocialProvider } from '@prisma/client';
import { Inject } from '@nestjs/common';
import { parseRedNoteMetadata } from '../domain/users/rednote-metadata.types';
import type { ISocialAccountRepository } from '../repositories/interfaces/social-account.repository.interface';
import { SOCIAL_ACCOUNT_REPOSITORY } from '../repositories/tokens';
import { RedNoteAdapter } from './adapters/rednote.adapter';
import { UsersService } from '../users/users.service';

@Injectable()
export class RedNoteHealthcheckCron {
  private readonly logger = new Logger(RedNoteHealthcheckCron.name);

  constructor(
    private readonly config: ConfigService,
    @Inject(SOCIAL_ACCOUNT_REPOSITORY)
    private readonly socialAccounts: ISocialAccountRepository,
    private readonly adapter: RedNoteAdapter,
    private readonly users: UsersService,
  ) {}

  @Cron(process.env.REDNOTE_HEALTHCHECK_CRON || '0 */6 * * *')
  async runHealthCheck(): Promise<void> {
    const ttlHours = Number(
      this.config.get('REDNOTE_SESSION_TTL_HOURS') ?? 12,
    );
    const staleAfterHours = Math.max(1, ttlHours - 2);
    const accounts = await this.socialAccounts.findAllActiveByProvider(
      SocialProvider.REDNOTE,
    );

    let checked = 0;
    for (const account of accounts) {
      const meta = parseRedNoteMetadata(account.metadata);
      if (!meta?.lastVerifiedAt) continue;
      const hours =
        (Date.now() - new Date(meta.lastVerifiedAt).getTime()) /
        (1000 * 60 * 60);
      if (hours < staleAfterHours) continue;
      try {
        await this.adapter.checkHealth(account);
        checked += 1;
      } catch (err) {
        this.logger.warn(
          `RedNote health-check failed user=${account.userId}: ${err instanceof Error ? err.message : String(err)}`,
        );
        await this.users.markRedNoteNeedsReauth(account.userId);
      }
    }
    if (checked > 0) {
      this.logger.log(`RedNote health-check verified ${checked} account(s)`);
    }
  }
}
