import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { randomUUID } from 'crypto';
import { UsersService } from '../../users/users.service';
import { RedNoteCookieCryptoService } from '../crypto/rednote-cookie-crypto.service';
import { RedNoteLoginInProgressError } from '../errors/rednote.errors';
import { RedNoteBrowserService } from '../rednote-browser.service';
import {
  REDNOTE_LOGIN_QUEUE,
  rednoteLoginLockKey,
  type RedNoteLoginJobData,
} from '../rednote.constants';
import { RedNoteGateway } from '../rednote.gateway';
import { RedNoteLockService } from '../rednote-lock.service';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Processor(REDNOTE_LOGIN_QUEUE, {
  concurrency: Number(process.env.REDNOTE_LOGIN_CONCURRENCY ?? 2),
})
export class RedNoteLoginProcessor extends WorkerHost {
  private readonly logger = new Logger(RedNoteLoginProcessor.name);

  constructor(
    private readonly config: ConfigService,
    private readonly locks: RedNoteLockService,
    private readonly browserService: RedNoteBrowserService,
    private readonly cookieCrypto: RedNoteCookieCryptoService,
    private readonly users: UsersService,
    private readonly gateway: RedNoteGateway,
  ) {
    super();
  }

  async process(job: Job<RedNoteLoginJobData>): Promise<void> {
    const { userId } = job.data;
    const lockTtl = Number(
      this.config.get('REDNOTE_LOGIN_LOCK_TTL_SECONDS') ?? 300,
    );
    const lockKey = rednoteLoginLockKey(userId);
    const acquired = await this.locks.tryAcquire(lockKey, lockTtl);
    if (!acquired) {
      this.gateway.emitToUser(userId, 'login_failed', {
        reason: 'login_in_progress',
      });
      throw new RedNoteLoginInProgressError();
    }

    const timeoutMs = Number(
      this.config.get('REDNOTE_LOGIN_TIMEOUT_MS') ?? 120_000,
    );
    // Give the Settings modal time to open the socket and join the room.
    await sleep(2000);

    const browser = await this.browserService.launch();
    let meCapture:
      | { getHandle: () => string | undefined; dispose: () => void }
      | undefined;
    try {
      const page = await browser.newPage();
      await this.browserService.preparePage(page);
      meCapture = this.browserService.attachMeProfileCapture(page);

      await page.goto(this.browserService.loginUrl(), {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
      });
      await sleep(2500);

      await this.browserService.openLoginModal(page);

      const probe = await this.browserService.postModalOpenProbe(page);
      this.logger.log(
        `Post-modal-open user=${userId} modal=${probe.modalOpen} qrEl=${probe.qrElExists} qrVisible=${probe.qrVisible} src=${probe.qrSrcKind} captureBytes=${probe.capture?.length ?? 0}`,
      );

      // Emit immediately so the UI is not stuck on "Waiting for QR…" while we poll.
      let lastQrHash: string | null = null;
      let sawQr = false;
      const first = probe.capture;
      if (first && this.browserService.isScannableQrBase64(first)) {
        sawQr = true;
        lastQrHash = first;
        this.gateway.emitToUser(userId, 'qr_frame', { image: first });
        this.logger.log(
          `RedNote first QR frame emitted user=${userId} bytes≈${first.length}`,
        );
      } else {
        this.logger.warn(
          `RedNote first capture not scannable user=${userId} bytes=${first?.length ?? 0} qrEl=${probe.qrElExists} src=${probe.qrSrcKind}`,
        );
      }

      let modalConfirmedOpen =
        (await this.browserService.isLoginModalOpen(page)) || sawQr;
      const deadline = Date.now() + timeoutMs;
      let emptyCaptureStreak = 0;

      while (Date.now() < deadline) {
        const modalOpen = await this.browserService.isLoginModalOpen(page);
        if (modalOpen) modalConfirmedOpen = true;

        if (modalConfirmedOpen && !modalOpen && sawQr) {
          const cookies = await page.cookies();
          const encrypted = this.cookieCrypto.encrypt(JSON.stringify(cookies));
          const ref = this.cookieCrypto.newCookiesRef();
          const nowIso = new Date().toISOString();

          // Prefer network-captured /user/me from the QR login success flow;
          // then retry an explicit me fetch. Never scrape DOM names.
          await sleep(1500);
          let handle = meCapture.getHandle();
          if (!handle) {
            handle = await this.browserService.extractLoggedInUserHandle(page);
          }

          await this.users.upsertRedNoteSession(userId, {
            sessionCookiesRef: ref || `rnck_${randomUUID().replace(/-/g, '')}`,
            encryptedCookies: encrypted,
            sessionStatus: 'active',
            lastVerifiedAt: nowIso,
            lastQrScanAt: nowIso,
            ...(handle ? { rednoteUserHandle: handle } : {}),
          });

          this.gateway.emitToUser(userId, 'login_success', {
            handle: handle ?? null,
          });
          this.logger.log(
            `RedNote login success user=${userId} handle=${handle ?? 'n/a'}`,
          );
          return;
        }

        const qr = await this.browserService.captureQrBase64(page);
        if (qr && this.browserService.isScannableQrBase64(qr)) {
          emptyCaptureStreak = 0;
          sawQr = true;
          if (qr !== lastQrHash) {
            this.gateway.emitToUser(userId, 'qr_frame', { image: qr });
            lastQrHash = qr;
            this.logger.debug(
              `RedNote QR frame refresh user=${userId} bytes≈${qr.length}`,
            );
          }
        } else {
          emptyCaptureStreak += 1;
          if (emptyCaptureStreak === 1 || emptyCaptureStreak % 10 === 0) {
            this.logger.warn(
              `RedNote QR capture empty/unscannable user=${userId} streak=${emptyCaptureStreak} bytes=${qr?.length ?? 0}`,
            );
          }
        }
        await sleep(1500);
      }

      this.gateway.emitToUser(userId, 'login_failed', { reason: 'timeout' });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.error(`RedNote login failed user=${userId}: ${reason}`);
      this.gateway.emitToUser(userId, 'login_failed', { reason });
      throw err;
    } finally {
      meCapture?.dispose();
      await browser.close().catch(() => undefined);
      await this.locks.release(lockKey);
      this.gateway.clearQrCache(userId);
    }
  }
}
