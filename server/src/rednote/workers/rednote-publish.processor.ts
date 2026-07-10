import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { createWriteStream, promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import type { CookieParam, ElementHandle } from 'puppeteer';
import { parseRedNoteMetadata } from '../../domain/users/rednote-metadata.types';
import type { PublishResult } from '../../social/social-publish.types';
import { UsersService } from '../../users/users.service';
import { RedNoteCookieCryptoService } from '../crypto/rednote-cookie-crypto.service';
import {
  RedNoteConcurrentPublishError,
  RedNoteSelectorMismatchError,
  RedNoteSessionInvalidError,
  RedNoteUploadTimeoutError,
} from '../errors/rednote.errors';
import { RedNoteBrowserService } from '../rednote-browser.service';
import {
  REDNOTE_PUBLISH_QUEUE,
  rednotePublishLockKey,
  type RedNotePublishJobData,
} from '../rednote.constants';
import { RedNoteLockService } from '../rednote-lock.service';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function deriveRedNoteTitle(caption: string): string {
  const firstLine = caption.trim().split(/\r?\n/)[0]?.trim() ?? '';
  const compact = firstLine || caption.trim();
  return compact.slice(0, 20);
}

@Processor(REDNOTE_PUBLISH_QUEUE, {
  concurrency: Number(process.env.REDNOTE_PUBLISH_CONCURRENCY ?? 1),
})
export class RedNotePublishProcessor extends WorkerHost {
  private readonly logger = new Logger(RedNotePublishProcessor.name);

  constructor(
    private readonly config: ConfigService,
    private readonly locks: RedNoteLockService,
    private readonly browserService: RedNoteBrowserService,
    private readonly cookieCrypto: RedNoteCookieCryptoService,
    private readonly users: UsersService,
  ) {
    super();
  }

  async process(job: Job<RedNotePublishJobData>): Promise<PublishResult> {
    const { userId, postId, caption, mediaUrls } = job.data;
    const lockTtl = Number(
      this.config.get('REDNOTE_PUBLISH_LOCK_TTL_SECONDS') ?? 180,
    );
    const lockKey = rednotePublishLockKey(userId);
    const acquired = await this.locks.tryAcquire(lockKey, lockTtl);
    if (!acquired) {
      throw new RedNoteConcurrentPublishError();
    }

    const account = await this.users.findRedNoteAccountAnyStatus(userId);
    const meta = account ? parseRedNoteMetadata(account.metadata) : null;
    if (!account || !meta?.encryptedCookies) {
      if (account) await this.users.markRedNoteNeedsReauth(userId);
      throw new RedNoteSessionInvalidError();
    }

    const browser = await this.browserService.launch();
    const tmpPaths: string[] = [];
    try {
      const page = await browser.newPage();
      await this.browserService.preparePage(page);

      let cookies: CookieParam[];
      try {
        cookies = JSON.parse(
          this.cookieCrypto.decrypt(meta.encryptedCookies),
        ) as CookieParam[];
      } catch {
        await this.users.markRedNoteNeedsReauth(userId);
        throw new RedNoteSessionInvalidError('Failed to decrypt RedNote cookies');
      }

      await page.setCookie(...cookies);
      await page.goto(this.browserService.publishUrl(), {
        waitUntil: 'networkidle2',
        timeout: 60_000,
      });

      if (!(await this.browserService.isCreatorLoggedIn(page))) {
        await this.users.markRedNoteNeedsReauth(userId);
        throw new RedNoteSessionInvalidError();
      }

      tmpPaths.push(...(await this.downloadMediaToTmp(mediaUrls)));
      const videoPath = tmpPaths.find((p) => /\.mp4$/i.test(p));
      const imagePaths = tmpPaths.filter((p) =>
        /\.(jpe?g|png|webp)$/i.test(p),
      );

      if (videoPath) {
        await this.publishVideo(page, videoPath, caption);
      } else if (imagePaths.length > 0) {
        await this.publishImages(page, imagePaths, caption);
      } else {
        throw new RedNoteSelectorMismatchError(
          'No supported RedNote media files (video or image)',
        );
      }

      const publishClicked = await this.browserService.clickPublishButton(page);
      if (!publishClicked) {
        throw new RedNoteSelectorMismatchError(
          'Could not locate RedNote publish button',
        );
      }

      await sleep(4000);
      const noteUrl = await page.evaluate(() => {
        const a = document.querySelector(
          'a[href*="/explore/"], a[href*="/discovery/"]',
        ) as HTMLAnchorElement | null;
        return a?.href ?? null;
      });

      await this.users.upsertRedNoteSession(userId, {
        ...meta,
        sessionStatus: 'active',
        lastVerifiedAt: new Date().toISOString(),
      });

      if (!noteUrl) {
        this.logger.warn(
          `RedNote publish unconfirmed post=${postId} user=${userId}`,
        );
        return {
          success: true,
          confirmationMethod: 'dom_scrape',
          needsManualVerification: true,
          externalPostRef: null,
        };
      }

      this.logger.log(
        `RedNote publish success post=${postId} user=${userId} url=${noteUrl}`,
      );
      return {
        success: true,
        confirmationMethod: 'dom_scrape',
        externalPostRef: noteUrl,
        needsManualVerification: false,
      };
    } finally {
      await browser.close().catch(() => undefined);
      await this.locks.release(lockKey);
      await Promise.all(
        tmpPaths.map((p) => fs.unlink(p).catch(() => undefined)),
      );
    }
  }

  private async publishVideo(
    page: import('puppeteer').Page,
    videoPath: string,
    caption: string,
  ): Promise<void> {
    const fileInput = (await page.$(
      this.browserService.videoUploadInputSelector(),
    )) as ElementHandle<HTMLInputElement> | null;
    if (!fileInput) {
      throw new RedNoteSelectorMismatchError('Video upload input not found');
    }

    const uploadStarted = Date.now();
    await fileInput.uploadFile(videoPath);

    const ready = await this.browserService.waitForTitleInput(
      page,
      this.browserService.videoProcessingTimeoutMs(),
    );
    if (!ready) {
      throw new RedNoteUploadTimeoutError(
        'Timed out waiting for RedNote video processing',
      );
    }

    this.logger.debug(
      `RedNote video processing ready in ${Date.now() - uploadStarted}ms`,
    );

    const title = deriveRedNoteTitle(caption);
    await this.browserService.fillTitle(page, title);
    await this.browserService.fillBody(page, caption);
  }

  private async publishImages(
    page: import('puppeteer').Page,
    imagePaths: string[],
    caption: string,
  ): Promise<void> {
    const fileInput = (await page.$(
      this.browserService.imageUploadInputSelector(),
    )) as ElementHandle<HTMLInputElement> | null;
    if (!fileInput) {
      throw new RedNoteSelectorMismatchError('Image upload input not found');
    }

    await fileInput.uploadFile(...imagePaths);
    const ready = await this.browserService.waitForTitleInput(
      page,
      this.browserService.videoProcessingTimeoutMs(),
    );
    if (!ready) {
      throw new RedNoteUploadTimeoutError(
        'Timed out waiting for RedNote image upload UI',
      );
    }

    const title = deriveRedNoteTitle(caption);
    await this.browserService.fillTitle(page, title);
    await this.browserService.fillBody(page, caption);
  }

  private async downloadMediaToTmp(urls: string[]): Promise<string[]> {
    const out: string[] = [];
    for (let i = 0; i < urls.length; i += 1) {
      const url = urls[i]?.trim();
      if (!url) continue;
      const res = await fetch(url);
      if (!res.ok || !res.body) {
        throw new RedNoteUploadTimeoutError(
          `Failed to download media (${res.status})`,
        );
      }
      const ext = guessExt(url, res.headers.get('content-type'));
      const path = join(tmpdir(), `rednote-${Date.now()}-${i}${ext}`);
      const fileStream = createWriteStream(path);
      await pipeline(Readable.fromWeb(res.body as never), fileStream);
      out.push(path);
    }
    return out;
  }
}

function guessExt(url: string, contentType: string | null): string {
  if (contentType?.includes('video')) return '.mp4';
  if (contentType?.includes('png')) return '.png';
  if (contentType?.includes('webp')) return '.webp';
  if (/\.mp4(\?|$)/i.test(url)) return '.mp4';
  if (/\.png(\?|$)/i.test(url)) return '.png';
  return '.jpg';
}
