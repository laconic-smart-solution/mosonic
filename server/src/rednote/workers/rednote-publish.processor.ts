import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { createWriteStream, promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import type { Browser, CookieParam } from 'puppeteer';
import { parseRedNoteMetadata } from '../../domain/users/rednote-metadata.types';
import type { PublishResult } from '../../social/social-publish.types';
import { UsersService } from '../../users/users.service';
import { RedNoteCookieCryptoService } from '../crypto/rednote-cookie-crypto.service';
import {
  RedNoteConcurrentPublishError,
  RedNotePublishUnconfirmedError,
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
import { resolveAbsoluteMediaUrlFromConfig } from '../../upload/resolve-absolute-media-url.util';
import { UploadService } from '../../upload/upload.service';
import {
  sanitizeRedNoteCaption,
  sanitizeRedNoteTitle,
} from '../sanitize-rednote-text.util';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    @Inject(forwardRef(() => UploadService))
    private readonly uploadService: UploadService,
  ) {
    super();
  }

  async process(job: Job<RedNotePublishJobData>): Promise<PublishResult> {
    const { userId, postId, caption, mediaUrls } = job.data;
    this.logger.log(
      `RedNote publish job started post=${postId} user=${userId}`,
    );
    const lockTtl = Number(
      this.config.get('REDNOTE_PUBLISH_LOCK_TTL_SECONDS') ?? 600,
    );
    const lockKey = rednotePublishLockKey(userId);
    let lockHeld = false;
    let browser: Browser | undefined;
    const tmpPaths: string[] = [];
    let publishResult: PublishResult | undefined;
    let failure: unknown;

    try {
      const acquired = await this.locks.tryAcquire(lockKey, lockTtl);
      if (!acquired) {
        throw new RedNoteConcurrentPublishError();
      }
      lockHeld = true;

      const account = await this.users.findRedNoteAccountAnyStatus(userId);
      const meta = account ? parseRedNoteMetadata(account.metadata) : null;
      if (!account || !meta?.encryptedCookies) {
        throw new RedNoteSessionInvalidError();
      }

      browser = await this.browserService.launch();
      const page = await browser.newPage();
      await this.browserService.preparePage(page);

      let cookies: CookieParam[];
      try {
        cookies = JSON.parse(
          this.cookieCrypto.decrypt(meta.encryptedCookies),
        ) as CookieParam[];
      } catch {
        throw new RedNoteSessionInvalidError('Failed to decrypt RedNote cookies');
      }

      await this.browserService.applyStoredCookies(page, cookies);
      await this.browserService.openCreatorPublishPage(page);
      await this.browserService.assertCreatorSession(page);

      const videoUrl = pickVideoUrl(mediaUrls);
      if (!videoUrl) {
        throw new RedNoteUploadTimeoutError(
          'RedNote requires a video URL to publish',
        );
      }

      const fetchableVideoUrl = resolveAbsoluteMediaUrlFromConfig(
        videoUrl,
        this.config,
      );
      if (!/^https?:\/\//i.test(fetchableVideoUrl)) {
        throw new RedNoteUploadTimeoutError(
          `Video URL is not fetchable: ${videoUrl.slice(0, 120)}`,
        );
      }

      this.logger.log(
        `RedNote publish start post=${postId} user=${userId} video=${fetchableVideoUrl.slice(0, 80)}`,
      );

      tmpPaths.push(await this.downloadVideoToTmp(fetchableVideoUrl));
      await this.publishVideo(page, tmpPaths[0]!, caption);

      const publishClicked = await this.browserService.clickPublishButton(page);
      if (!publishClicked) {
        throw new RedNoteUploadTimeoutError(
          'RedNote publish button was not clickable — wait for video upload to finish, or UI selectors changed',
        );
      }

      this.logger.log(
        `RedNote publish clicked post=${postId}; waiting for success page`,
      );
      const confirmation =
        await this.browserService.waitForPublishSuccessConfirmation(
          page,
          this.browserService.publishSuccessTimeoutMs(),
        );
      if (!confirmation.confirmed) {
        throw new RedNotePublishUnconfirmedError(
          `RedNote success page did not appear (url=${confirmation.pageUrl})`,
        );
      }

      await this.users.upsertRedNoteSession(userId, {
        ...meta,
        sessionStatus: 'active',
        lastVerifiedAt: new Date().toISOString(),
      });

      this.logger.log(
        `RedNote publish success post=${postId} user=${userId} url=${confirmation.pageUrl}`,
      );
      publishResult = {
        success: true,
        confirmationMethod: 'dom_scrape',
        externalPostRef: confirmation.pageUrl || `rednote:${postId}`,
        needsManualVerification: false,
      };
      return publishResult;
    } catch (err) {
      failure = err;
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `RedNote publish failed post=${postId} user=${userId}: ${reason}`,
      );
      throw err;
    } finally {
      await browser?.close().catch(() => undefined);
      if (lockHeld) {
        await this.locks.release(lockKey);
      }
      await Promise.all(
        tmpPaths.map((p) => fs.unlink(p).catch(() => undefined)),
      );
      if (job.data.uploadId) {
        if (publishResult?.success) {
          await this.uploadService
            .finalizeRedNotePublishOutcome({
              uploadId: job.data.uploadId,
              userId,
              localPostId: postId,
              result: publishResult,
            })
            .catch(() => undefined);
        } else if (failure) {
          await this.uploadService
            .finalizeRedNotePublishOutcome({
              uploadId: job.data.uploadId,
              userId,
              localPostId: postId,
              error: failure,
            })
            .catch(() => undefined);
        }
      }
    }
  }

  private async publishVideo(
    page: import('puppeteer').Page,
    videoPath: string,
    caption: string,
  ): Promise<void> {
    const fileInput = await this.browserService.findVideoUploadInput(page);
    if (!fileInput) {
      throw new RedNoteSelectorMismatchError('Video upload input not found');
    }

    const uploadStarted = Date.now();
    await fileInput.uploadFile(videoPath);

    // Wait for creator UI to finish video processing AND re-render the edit form
    // (title + body + publish). Filling too early leaves empty fields.
    const ready = await this.browserService.waitForPublishFormReady(
      page,
      this.browserService.videoProcessingTimeoutMs(),
    );
    if (!ready) {
      throw new RedNoteUploadTimeoutError(
        'Timed out waiting for RedNote edit form after video upload',
      );
    }

    this.logger.log(
      `RedNote edit form ready in ${Date.now() - uploadStarted}ms`,
    );

    const safeCaption = sanitizeRedNoteCaption(caption);
    const title = sanitizeRedNoteTitle(safeCaption || caption);
    if (safeCaption !== caption.trim()) {
      this.logger.warn(
        'RedNote caption sanitized (removed special symbols from topics/hashtags)',
      );
    }
    await this.browserService.fillPublishFieldsWithRetry(
      page,
      title,
      safeCaption,
    );
    // Settle so TipTap/React enable the publish button after field commits.
    await sleep(1500);
  }

  private async downloadVideoToTmp(url: string): Promise<string> {
    const timeoutMs = Number(
      this.config.get('REDNOTE_VIDEO_DOWNLOAD_TIMEOUT_MS') ?? 120_000,
    );
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const started = Date.now();
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok || !res.body) {
        throw new RedNoteUploadTimeoutError(
          `Failed to download video (${res.status})`,
        );
      }
      const ext = guessVideoExt(url, res.headers.get('content-type'));
      const path = join(tmpdir(), `rednote-${Date.now()}${ext}`);
      const fileStream = createWriteStream(path);
      await pipeline(Readable.fromWeb(res.body as never), fileStream);
      this.logger.log(
        `RedNote video downloaded in ${Date.now() - started}ms`,
      );
      return path;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new RedNoteUploadTimeoutError(
          `Timed out downloading video after ${timeoutMs}ms`,
        );
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}

function pickVideoUrl(urls: string[]): string | null {
  for (const raw of urls) {
    const url = raw?.trim();
    if (!url) continue;
    if (isVideoMediaUrl(url)) return url;
  }
  return urls.map((u) => u?.trim()).find(Boolean) ?? null;
}

function isVideoMediaUrl(url: string): boolean {
  if (/\.(mp4|webm|mov|m4v|mkv)(\?|$)/i.test(url)) return true;
  if (/\/videos\//i.test(url)) return true;
  return false;
}

function guessVideoExt(url: string, contentType: string | null): string {
  if (contentType?.includes('video')) return '.mp4';
  if (/\.webm(\?|$)/i.test(url)) return '.webm';
  if (/\.mov(\?|$)/i.test(url)) return '.mov';
  if (/\.m4v(\?|$)/i.test(url)) return '.m4v';
  if (/\.mkv(\?|$)/i.test(url)) return '.mkv';
  if (/\.mp4(\?|$)/i.test(url)) return '.mp4';
  return '.mp4';
}
