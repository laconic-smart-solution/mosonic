import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { SocialAccountStatus } from '@prisma/client';
import type { SocialAccountRecord } from '../../domain/users/social-account.types';
import type {
  PublishContext,
  SocialProviderAdapter,
} from '../../social/social-provider.adapter';
import type {
  PublishPayload,
  PublishResult,
} from '../../social/social-publish.types';
import { UsersService } from '../../users/users.service';
import { parseRedNoteMetadata } from '../../domain/users/rednote-metadata.types';
import { RedNoteSessionInvalidError } from '../errors/rednote.errors';
import {
  REDNOTE_PUBLISH_QUEUE,
  rednotePublishJobId,
  type RedNotePublishJobData,
} from '../rednote.constants';
import { Queue } from 'bullmq';
import type { CookieParam } from 'puppeteer';
import { RedNoteBrowserService } from '../rednote-browser.service';
import { RedNoteCookieCryptoService } from '../crypto/rednote-cookie-crypto.service';

@Injectable()
export class RedNoteAdapter implements SocialProviderAdapter {
  constructor(
    private readonly users: UsersService,
    @InjectQueue(REDNOTE_PUBLISH_QUEUE)
    private readonly publishQueue: Queue<RedNotePublishJobData>,
    private readonly browserService: RedNoteBrowserService,
    private readonly cookieCrypto: RedNoteCookieCryptoService,
  ) {}

  async getContext(account: SocialAccountRecord): Promise<PublishContext> {
    const meta = parseRedNoteMetadata(account.metadata);
    if (!meta?.encryptedCookies) {
      throw new RedNoteSessionInvalidError();
    }
    if (account.status !== 'ACTIVE') {
      throw new RedNoteSessionInvalidError();
    }
    return {
      provider: 'REDNOTE',
      accountRef: account.id,
      userId: account.userId,
      channel: account.channel,
    };
  }

  async publish(
    _context: PublishContext,
    payload: PublishPayload,
  ): Promise<PublishResult> {
    const job = await this.publishQueue.add(
      'rednote-publish',
      {
        userId: payload.userId,
        postId: payload.postId,
        uploadId: payload.uploadId,
        channel: payload.channel,
        caption: payload.caption,
        mediaUrls: payload.mediaUrls,
        scheduledAt: payload.scheduledAt,
      },
      {
        jobId: rednotePublishJobId(payload.postId),
        attempts: 1,
        removeOnComplete: 50,
        removeOnFail: 100,
      },
    );
    return {
      success: true,
      confirmationMethod: 'dom_scrape',
      jobId: job.id,
      needsManualVerification: false,
    };
  }

  async disconnect(account: SocialAccountRecord): Promise<void> {
    await this.users.disconnectRedNote(account.userId);
  }

  async checkHealth(
    account: SocialAccountRecord,
  ): Promise<'active' | 'needs_reauth'> {
    const meta = parseRedNoteMetadata(account.metadata);
    if (
      !meta?.encryptedCookies ||
      account.status !== SocialAccountStatus.ACTIVE
    ) {
      return 'needs_reauth';
    }
    const browser = await this.browserService.launch();
    try {
      const page = await browser.newPage();
      await this.browserService.preparePage(page);
      let cookies: CookieParam[];
      try {
        cookies = JSON.parse(
          this.cookieCrypto.decrypt(meta.encryptedCookies),
        ) as CookieParam[];
      } catch {
        return 'needs_reauth';
      }
      await this.browserService.applyStoredCookies(page, cookies);
      await this.browserService.openCreatorPublishPage(page);
      const ok = await this.browserService.waitForCreatorLoggedIn(page, 20_000);
      if (ok) {
        // Only replace handle when /user/me returns a verified nickname —
        // never clear or invent one from DOM.
        const handle =
          await this.browserService.extractLoggedInUserHandle(page);
        await this.users.upsertRedNoteSession(account.userId, {
          ...meta,
          sessionStatus: 'active',
          lastVerifiedAt: new Date().toISOString(),
          rednoteUserHandle: handle ?? meta.rednoteUserHandle,
        });
        return 'active';
      }
      return 'needs_reauth';
    } finally {
      await browser.close().catch(() => undefined);
    }
  }
}
