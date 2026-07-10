import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Browser, ElementHandle, Page } from 'puppeteer';
import puppeteer from 'puppeteer';
import {
  RedNoteSelectorMismatchError,
  RedNoteSessionInvalidError,
} from './errors/rednote.errors';

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

@Injectable()
export class RedNoteBrowserService {
  private readonly logger = new Logger(RedNoteBrowserService.name);

  constructor(private readonly config: ConfigService) {}

  async launch(): Promise<Browser> {
    const executablePath = this.config
      .get<string>('REDNOTE_CHROMIUM_PATH')
      ?.trim();
    const headlessEnv = this.config.get<string>('REDNOTE_HEADLESS')?.trim();
    const headless =
      headlessEnv === 'false' || headlessEnv === '0' ? false : true;
    return puppeteer.launch({
      headless,
      ...(executablePath ? { executablePath } : {}),
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled',
        '--lang=zh-CN,zh',
        '--window-size=1600,1000',
      ],
      defaultViewport: { width: 1600, height: 1000, deviceScaleFactor: 1 },
    });
  }

  /** Prepare page so Xiaohongshu is less likely to serve a bot/empty shell. */
  async preparePage(page: Page): Promise<void> {
    const ua =
      this.config.get<string>('REDNOTE_USER_AGENT')?.trim() || DEFAULT_UA;
    await page.setUserAgent(ua);
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    });
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
      Object.defineProperty(navigator, 'languages', {
        get: () => ['zh-CN', 'zh', 'en'],
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).chrome = { runtime: {} };
    });
  }

  /** Explore home — QR login modal is opened from the sidebar login control. */
  loginUrl(): string {
    return (
      this.config.get<string>('REDNOTE_LOGIN_URL')?.trim() ||
      'https://www.xiaohongshu.com/explore'
    );
  }

  publishUrl(): string {
    return (
      this.config.get<string>('REDNOTE_PUBLISH_URL')?.trim() ||
      'https://creator.xiaohongshu.com/publish/publish'
    );
  }

  /**
   * Prefer the inner <button> — `#login-btn` is often a wrapper; clicking the
   * wrapper alone may not open the modal.
   */
  loginTriggerSelectors(): string[] {
    const raw =
      this.config.get<string>('REDNOTE_LOGIN_TRIGGER_SELECTOR')?.trim() ||
      [
        '#login-btn button',
        '.side-bar-component.login-btn button',
        '.login-btn button',
        'button.login-btn',
        '#login-btn',
        '.side-bar .login-btn',
        '.login-btn',
      ].join(',');
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }

  loginTriggerSelector(): string {
    return this.loginTriggerSelectors()[0] ?? '#login-btn button';
  }

  loginModalSelector(): string {
    return (
      this.config.get<string>('REDNOTE_LOGIN_MODAL_SELECTOR')?.trim() ||
      '.reds-modal.login-modal, .login-container, .reds-modal.reds-modal-open, .reds-modal-open'
    );
  }

  qrSelector(): string {
    return (
      this.config.get<string>('REDNOTE_QR_SELECTOR')?.trim() ||
      'img.qrcode-img, .qrcode img, .qrcode-container img, img[class*="qrcode"], canvas.qrcode, .qrcode canvas'
    );
  }

  /**
   * Containers to screenshot only after the login modal is open.
   * Do NOT use these for "QR already present" — `.qrcode` / `.left` often
   * match hidden empty nodes and cause a false auto-popup skip.
   */
  qrContainerSelectors(): string[] {
    const raw =
      this.config.get<string>('REDNOTE_QR_CONTAINER_SELECTOR')?.trim() ||
      '.qrcode.force-light, .qrcode-container, .login-container .qrcode';
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }

  qrSelectors(): string[] {
    return this.qrSelector()
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  loggedInSelectors(): string[] {
    const raw =
      this.config.get<string>('REDNOTE_LOGGED_IN_SELECTOR')?.trim() ||
      '.creator-header, .user-info, [class*="avatar"]';
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }

  /** Positive session signal on creator publish pages (only when authenticated). */
  creatorLoggedInAvatarSelector(): string {
    return (
      this.config.get<string>('REDNOTE_CREATOR_LOGGED_IN_SELECTOR')?.trim() ||
      '.d-topbar-default .user-info img.user_avatar'
    );
  }

  videoUploadInputSelector(): string {
    return (
      this.config.get<string>('REDNOTE_VIDEO_INPUT_SELECTOR')?.trim() ||
      '.drag-over input.upload-input[accept*=".mp4"]'
    );
  }

  imageUploadInputSelector(): string {
    return (
      this.config.get<string>('REDNOTE_IMAGE_INPUT_SELECTOR')?.trim() ||
      '.drag-over input.upload-input'
    );
  }

  titleInputSelector(): string {
    return (
      this.config.get<string>('REDNOTE_TITLE_INPUT_SELECTOR')?.trim() ||
      '.edit-container input.d-text, input.d-text[placeholder*="title"], input.d-text[placeholder*="标题"]'
    );
  }

  bodyEditorSelector(): string {
    return (
      this.config.get<string>('REDNOTE_BODY_EDITOR_SELECTOR')?.trim() ||
      'div.tiptap.ProseMirror[contenteditable="true"]'
    );
  }

  publishButtonHostSelector(): string {
    return (
      this.config.get<string>('REDNOTE_PUBLISH_BUTTON_SELECTOR')?.trim() ||
      'button.ce-btn.bg-red, xhs-publish-btn, button.ce-btn'
    );
  }

  /** Ordered candidates for the red "发布" control (live creator UI). */
  publishButtonSelectors(): string[] {
    const raw = this.publishButtonHostSelector();
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  videoProcessingTimeoutMs(): number {
    const raw = Number(
      this.config.get('REDNOTE_VIDEO_PROCESS_TIMEOUT_MS') ?? 120_000,
    );
    return Number.isFinite(raw) && raw > 0 ? raw : 120_000;
  }

  publishSuccessTimeoutMs(): number {
    const raw = Number(
      this.config.get('REDNOTE_PUBLISH_SUCCESS_TIMEOUT_MS') ?? 60_000,
    );
    return Number.isFinite(raw) && raw > 0 ? raw : 60_000;
  }

  isCreatorCenterUrl(url: string): boolean {
    return /creator\.(xiaohongshu|rednote)\.com/i.test(url);
  }

  mediaInputSelector(): string {
    return (
      this.config.get<string>('REDNOTE_MEDIA_INPUT_SELECTOR')?.trim() ||
      'input[type="file"]'
    );
  }

  captionSelector(): string {
    return (
      this.config.get<string>('REDNOTE_CAPTION_SELECTOR')?.trim() ||
      'textarea, [contenteditable="true"]'
    );
  }

  publishButtonSelector(): string {
    return this.publishButtonHostSelector();
  }

  async findFirst(page: Page, selectors: string[]): Promise<ElementHandle | null> {
    for (const sel of selectors) {
      try {
        const el = await page.$(sel);
        if (el) return el;
      } catch {
        // continue
      }
    }
    return null;
  }

  async waitForAny(
    page: Page,
    selectors: string[],
    timeoutMs: number,
  ): Promise<ElementHandle | null> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const el = await this.findFirst(page, selectors);
      if (el) return el;
      await new Promise((r) => setTimeout(r, 400));
    }
    return null;
  }

  async clickLoginTrigger(page: Page): Promise<void> {
    for (const selector of this.loginTriggerSelectors()) {
      try {
        const el = await page.$(selector);
        if (!el) continue;
        const visible = await el
          .evaluate((node) => {
            if (!(node instanceof HTMLElement)) return false;
            const style = window.getComputedStyle(node);
            if (
              style.display === 'none' ||
              style.visibility === 'hidden' ||
              Number(style.opacity) === 0
            ) {
              return false;
            }
            const rect = node.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          })
          .catch(() => false);
        if (!visible) {
          await el.dispose().catch(() => undefined);
          continue;
        }
        await el.evaluate((node) => {
          if (node instanceof HTMLElement) {
            node.scrollIntoView({ block: 'center', inline: 'center' });
          }
        });
        await new Promise((r) => setTimeout(r, 300));
        try {
          await el.click({ delay: 40 });
        } catch {
          await el.evaluate((node) => {
            if (node instanceof HTMLElement) node.click();
          });
        }
        await el.dispose().catch(() => undefined);
        this.logger.log(
          `RedNote login trigger clicked via CSS selector ${selector}`,
        );
        return;
      } catch {
        // try next selector
      }
    }

    // MediaCrawler-style XPath fallback for the sidebar login button.
    const xpathClicked = await page.evaluate(() => {
      const result = document.evaluate(
        "//*[@id='app']//button[contains(normalize-space(.), '登录')]",
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null,
      );
      const node = result.singleNodeValue;
      if (node instanceof HTMLElement) {
        node.scrollIntoView({ block: 'center' });
        node.click();
        return true;
      }
      return false;
    });
    if (xpathClicked) {
      this.logger.log('RedNote login trigger clicked via XPath button[登录]');
      return;
    }

    const clickedByText = await page.evaluate(() => {
      const nodes = Array.from(
        document.querySelectorAll('button, a, div[role="button"]'),
      );
      const login = nodes.find((n) => {
        const t = (n.textContent || '').replace(/\s+/g, '').trim();
        return t === '登录' || t === 'Login';
      });
      if (login instanceof HTMLElement) {
        login.click();
        return true;
      }
      return false;
    });
    if (!clickedByText) {
      const diag = await this.pageDiagnostics(page);
      throw new Error(
        `Login trigger not found (${this.loginTriggerSelectors().join(' | ')}). ${diag}`,
      );
    }
    this.logger.log('RedNote login trigger clicked via text "登录"');
  }

  /** If phone/SMS form is showing, switch to the QR panel when possible. */
  async ensureQrPanel(page: Page): Promise<void> {
    if (await this.findVisibleQrElement(page)) return;

    await page.evaluate(() => {
      const candidates = Array.from(
        document.querySelectorAll(
          'div, span, button, a, li, [role="tab"], [class*="qr"], [class*="code"]',
        ),
      );
      const hit = candidates.find((n) => {
        const t = (n.textContent || '').replace(/\s+/g, '').trim();
        return (
          t === '扫码登录' ||
          t === '二维码登录' ||
          t === '扫码' ||
          t.includes('扫码登录')
        );
      });
      if (hit instanceof HTMLElement) hit.click();
    });
    await new Promise((r) => setTimeout(r, 800));
  }

  loginModalSelectors(): string[] {
    return this.loginModalSelector()
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  /**
   * Open QR login without blind-clicking.
   * Explore often auto-opens the modal on navigation — clicking `#login-btn`
   * again can be a no-op or close it. Only click when the modal is absent.
   */
  async openLoginModal(page: Page): Promise<void> {
    const modalAlreadyOpen = await this.isLoginModalOpen(page);
    if (modalAlreadyOpen) {
      this.logger.log(
        'RedNote login modal already open after navigation — skipping trigger click',
      );
      await this.ensureQrPanel(page);
    } else {
      // Wait briefly for auto-popup before clicking (JS animation / delayed mount).
      const autoModal = await this.waitForAny(
        page,
        this.loginModalSelectors(),
        4_000,
      );
      if (autoModal) {
        this.logger.log(
          'RedNote login modal auto-opened — skipping trigger click',
        );
        await this.ensureQrPanel(page);
      } else {
        await this.clickLoginTrigger(page);
        const opened = await this.waitForAny(
          page,
          this.loginModalSelectors(),
          12_000,
        );
        if (!opened) {
          this.logger.warn(
            'Login modal not visible after first click; retrying once',
          );
          await this.clickLoginTrigger(page);
          await this.waitForAny(page, this.loginModalSelectors(), 8_000);
        }
        await this.ensureQrPanel(page);
      }
    }

    // QR src is often filled async after the modal mounts — wait for capturable pixels.
    const captured = await this.waitForCapturableQr(page, 45_000);
    if (!captured) {
      const diag = await this.pageDiagnostics(page);
      throw new Error(
        `QR image not found after opening login (${this.qrSelectors().join(' | ')}). ${diag}`,
      );
    }
  }

  /** Snapshot of modal/QR DOM state for logs (does not throw). */
  async postModalOpenProbe(page: Page): Promise<{
    modalOpen: boolean;
    qrElExists: boolean;
    qrVisible: boolean;
    qrSrcKind: string;
    capture: string | null;
  }> {
    const modalOpen = await this.isLoginModalOpen(page);
    const qrEl = await this.findFirst(page, this.qrSelectors());
    const qrElExists = Boolean(qrEl);
    let qrSrcKind = 'none';
    if (qrEl) {
      try {
        qrSrcKind = await qrEl.evaluate((node) => {
          if (!(node instanceof HTMLImageElement)) return node.tagName;
          const src = node.src || '';
          if (src.startsWith('data:image'))
            return `data:${node.naturalWidth}x${node.naturalHeight}`;
          if (src) return `url:${node.naturalWidth}x${node.naturalHeight}`;
          return 'img-empty-src';
        });
      } catch {
        qrSrcKind = 'probe-failed';
      }
      await qrEl.dispose().catch(() => undefined);
    }
    const visible = await this.findVisibleQrElement(page);
    const qrVisible = Boolean(visible);
    if (visible) await visible.dispose().catch(() => undefined);
    const capture = await this.captureQrBase64(page);
    return {
      modalOpen,
      qrElExists,
      qrVisible,
      qrSrcKind,
      capture,
    };
  }

  /** Visible element only — skips zero-size / display:none stubs. */
  async findVisibleQrElement(
    page: Page,
    preferImgOnly = false,
  ): Promise<ElementHandle | null> {
    const selectors = preferImgOnly
      ? this.qrSelectors()
      : [...this.qrSelectors(), ...this.qrContainerSelectors()];
    for (const sel of selectors) {
      try {
        const handles = await page.$$(sel);
        for (const el of handles) {
          const ok = await el.evaluate((node) => {
            if (!(node instanceof HTMLElement)) return false;
            const style = window.getComputedStyle(node);
            if (
              style.display === 'none' ||
              style.visibility === 'hidden' ||
              Number(style.opacity) === 0
            ) {
              return false;
            }
            const rect = node.getBoundingClientRect();
            if (rect.width < 80 || rect.height < 80) return false;
            if (node instanceof HTMLImageElement) {
              if (!node.src || node.naturalWidth < 80 || node.naturalHeight < 80) {
                return false;
              }
            }
            // Containers without a loaded child img are not scannable yet.
            if (
              !(node instanceof HTMLImageElement) &&
              !(node instanceof HTMLCanvasElement)
            ) {
              const childImg = node.querySelector('img, canvas');
              if (!childImg) return false;
              if (childImg instanceof HTMLImageElement) {
                if (
                  !childImg.src ||
                  childImg.naturalWidth < 80 ||
                  childImg.naturalHeight < 80
                ) {
                  return false;
                }
              }
            }
            return true;
          });
          if (ok) return el;
          await el.dispose().catch(() => undefined);
        }
      } catch {
        // continue
      }
    }
    return null;
  }

  async waitForCapturableQr(
    page: Page,
    timeoutMs: number,
  ): Promise<string | null> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      // Wait for the real QR <img> to appear and decode before capturing.
      try {
        await page.waitForFunction(
          () => {
            const imgs = Array.from(
              document.querySelectorAll<HTMLImageElement>(
                'img.qrcode-img, .qrcode img, .qrcode-container img',
              ),
            );
            return imgs.some(
              (img) =>
                img.src &&
                img.naturalWidth >= 80 &&
                img.naturalHeight >= 80 &&
                img.getBoundingClientRect().width >= 100,
            );
          },
          { timeout: 2_000 },
        );
      } catch {
        // keep polling
      }
      const shot = await this.captureQrBase64(page);
      if (shot) return shot;
      await this.ensureQrPanel(page);
      await new Promise((r) => setTimeout(r, 500));
    }
    return null;
  }

  async pageDiagnostics(page: Page): Promise<string> {
    try {
      const info = await page.evaluate(() => {
        const title = document.title;
        const bodyText = (document.body?.innerText || '')
          .replace(/\s+/g, ' ')
          .slice(0, 220);
        const hasApp = Boolean(document.querySelector('#app'));
        const loginBtn = Boolean(document.querySelector('#login-btn'));
        const loginBtnButton = Boolean(
          document.querySelector('#login-btn button'),
        );
        const loginClass = Boolean(document.querySelector('.login-btn'));
        const modal = Boolean(
          document.querySelector(
            '.reds-modal.login-modal, .login-container, .reds-modal-open',
          ),
        );
        const qrImg = Boolean(document.querySelector('img.qrcode-img'));
        const qrBox = Boolean(
          document.querySelector('.qrcode, .qrcode-container'),
        );
        const canvasCount = document.querySelectorAll('canvas').length;
        const captcha = bodyText.includes('请通过验证') || bodyText.includes('验证');
        return {
          title,
          bodyText,
          hasApp,
          loginBtn,
          loginBtnButton,
          loginClass,
          modal,
          qrImg,
          qrBox,
          canvasCount,
          captcha,
        };
      });
      return `url=${page.url()} title=${JSON.stringify(info.title)} hasApp=${info.hasApp} #login-btn=${info.loginBtn} #login-btn>button=${info.loginBtnButton} .login-btn=${info.loginClass} modal=${info.modal} qrImg=${info.qrImg} qrBox=${info.qrBox} canvas=${info.canvasCount} captchaHint=${info.captcha} body=${JSON.stringify(info.bodyText)}`;
    } catch (err) {
      return `url=${page.url()} diagFailed=${err instanceof Error ? err.message : String(err)}`;
    }
  }

  async isLoginModalOpen(page: Page): Promise<boolean> {
    const sels = this.loginModalSelector()
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return Boolean(await this.findFirst(page, sels));
  }

  /**
   * Login success heuristic after the modal was opened: modal gone from DOM.
   * Confirm against live DOM during QA — inferred from static markup.
   */
  async isQrLoginSucceeded(page: Page): Promise<boolean> {
    return !(await this.isLoginModalOpen(page));
  }

  /** Session check for publish / health (creator center or explore). */
  async isLoggedIn(page: Page): Promise<boolean> {
    const url = page.url();
    if (this.isCreatorCenterUrl(url)) {
      return this.isCreatorLoggedIn(page);
    }
    // Explore — anonymous visitors show a login control in the sidebar.
    if (await this.findFirst(page, this.loginTriggerSelectors())) {
      return false;
    }
    for (const sel of this.loggedInSelectors()) {
      try {
        const el = await page.$(sel);
        if (el) return true;
      } catch {
        // continue
      }
    }
    return false;
  }

  /** Positive check on creator publish pages — avatar only renders when authenticated. */
  async isCreatorLoggedIn(page: Page): Promise<boolean> {
    try {
      const avatar = await page.$(this.creatorLoggedInAvatarSelector());
      return avatar !== null;
    } catch {
      return false;
    }
  }

  normalizeSessionCookies(
    cookies: import('puppeteer').CookieParam[],
  ): import('puppeteer').CookieParam[] {
    return cookies.map((c) => ({
      ...c,
      domain:
        c.domain && c.domain.length > 0 ? c.domain : '.xiaohongshu.com',
      path: c.path ?? '/',
    }));
  }

  /** Seed cookies on the main site domain before opening creator center. */
  async applyStoredCookies(
    page: Page,
    cookies: import('puppeteer').CookieParam[],
  ): Promise<void> {
    const normalized = this.normalizeSessionCookies(cookies);
    await page.goto('https://www.xiaohongshu.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    });
    if (normalized.length > 0) {
      await page.setCookie(...normalized);
    }
  }

  async openCreatorPublishPage(page: Page): Promise<void> {
    const publishUrl = this.publishUrl();
    const creatorOrigin = (() => {
      try {
        return new URL(publishUrl).origin;
      } catch {
        return 'https://creator.xiaohongshu.com';
      }
    })();

    // Warm up creator SSO — explore cookies alone may not auth the publish app.
    await page.goto(`${creatorOrigin}/`, {
      waitUntil: 'domcontentloaded',
      timeout: 45_000,
    });
    await new Promise((r) => setTimeout(r, 1500));
    await page.goto(publishUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
  }

  async waitForCreatorLoggedIn(
    page: Page,
    timeoutMs = 20_000,
  ): Promise<boolean> {
    const sel = this.creatorLoggedInAvatarSelector();
    try {
      await page.waitForSelector(sel, { visible: true, timeout: timeoutMs });
      return true;
    } catch {
      return this.isCreatorLoggedIn(page);
    }
  }

  /**
   * Confirms creator session via avatar. Does not mutate account status — callers
   * decide whether to mark needs_reauth (publish failures should not).
   */
  async assertCreatorSession(page: Page): Promise<void> {
    if (await this.waitForCreatorLoggedIn(page, 20_000)) return;

    const url = page.url();
    if (/\/login/i.test(url)) {
      throw new RedNoteSessionInvalidError();
    }

    await page.reload({ waitUntil: 'domcontentloaded', timeout: 45_000 });
    if (await this.waitForCreatorLoggedIn(page, 15_000)) return;

    throw new RedNoteSessionInvalidError(
      'Could not verify RedNote creator session for publish',
    );
  }

  async findVideoUploadInput(
    page: Page,
  ): Promise<ElementHandle<HTMLInputElement> | null> {
    const selectors = [
      this.videoUploadInputSelector(),
      '.drag-over input.upload-input[type="file"]',
      'input.upload-input[accept*="mp4"]',
      'input.upload-input[accept*="video"]',
      'input.upload-input',
      'input[type="file"]',
    ];
    return (await this.findFirst(
      page,
      selectors,
    )) as ElementHandle<HTMLInputElement> | null;
  }

  /**
   * Clicks the red "发布" button. Prefers `button.ce-btn.bg-red`, then
   * `<xhs-publish-btn>` shadow DOM, then any button whose text is 发布.
   * Scrolls into view so a clipped footer button is still clickable.
   */
  async clickPublishButton(page: Page): Promise<boolean> {
    const selectors = this.publishButtonSelectors();
    const deadline = Date.now() + 30_000;

    while (Date.now() < deadline) {
      // 1) Known CSS selectors
      for (const sel of selectors) {
        const handle = await page.$(sel);
        if (!handle) continue;

        const clicked = await this.clickPublishCandidate(page, handle, sel);
        if (clicked) return true;
      }

      // 2) Text match: button containing 发布
      const byText = await page.evaluateHandle(() => {
        const buttons = Array.from(
          document.querySelectorAll('button, [role="button"]'),
        );
        return (
          buttons.find((el) => {
            const t = (el.textContent ?? '').replace(/\s+/g, '');
            return t === '发布' || t.includes('发布');
          }) ?? null
        );
      });
      const el = byText.asElement();
      if (el) {
        const clicked = await this.clickPublishCandidate(page, el, 'text:发布');
        if (clicked) return true;
      }

      await new Promise((r) => setTimeout(r, 400));
    }
    return false;
  }

  private async clickPublishCandidate(
    page: Page,
    handle: ElementHandle,
    label: string,
  ): Promise<boolean> {
    try {
      // Shadow host: click inner button when present
      const clickedShadow = await handle.evaluate((host) => {
        const root = (host as HTMLElement & { shadowRoot?: ShadowRoot | null })
          .shadowRoot;
        if (!root) return false;
        const btn = root.querySelector(
          'button, [role="button"]',
        ) as HTMLButtonElement | null;
        if (!btn || btn.disabled) return false;
        btn.scrollIntoView({ block: 'center', inline: 'center' });
        btn.click();
        return true;
      });
      if (clickedShadow) {
        this.logger.debug(`Clicked publish via shadow (${label})`);
        return true;
      }

      const enabled = await handle.evaluate((node) => {
        if (!(node instanceof HTMLElement)) return false;
        const btn = node as HTMLButtonElement;
        if (btn.disabled) return false;
        if (btn.getAttribute('aria-disabled') === 'true') return false;
        const cls = btn.className?.toString?.() ?? '';
        if (/\bdisabled\b/i.test(cls) && !/\bbg-red\b/i.test(cls)) return false;
        node.scrollIntoView({ block: 'center', inline: 'center' });
        return true;
      });
      if (!enabled) return false;

      await handle.click({ delay: 40 });
      this.logger.debug(`Clicked publish via host (${label})`);
      return true;
    } catch (err) {
      this.logger.debug(
        `Publish click candidate failed (${label}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return false;
    }
  }

  async waitForTitleInput(page: Page, timeoutMs: number): Promise<boolean> {
    try {
      await page.waitForSelector(this.titleInputSelector(), {
        visible: true,
        timeout: timeoutMs,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * After video upload the creator UI re-renders the edit form. Wait until title
   * and body editor are present and stable (publish button may be off-screen).
   */
  async waitForPublishFormReady(
    page: Page,
    timeoutMs: number,
  ): Promise<boolean> {
    const titleSel = this.titleInputSelector();
    const bodySel = this.bodyEditorSelector();
    const deadline = Date.now() + timeoutMs;
    let lastBodyKey = '';

    while (Date.now() < deadline) {
      try {
        await page.waitForSelector(titleSel, {
          visible: true,
          timeout: Math.min(5_000, Math.max(500, deadline - Date.now())),
        });
        await page.waitForSelector(bodySel, {
          visible: true,
          timeout: Math.min(5_000, Math.max(500, deadline - Date.now())),
        });

        // Let SPA finish re-rendering after video processing completes.
        await new Promise((r) => setTimeout(r, 2000));

        const snapshot = await page.evaluate(
          (sels) => {
            const title = document.querySelector(sels.title);
            const body = document.querySelector(sels.body);
            if (!title || !body) return null;
            if (!(title instanceof HTMLElement) || !(body instanceof HTMLElement)) {
              return null;
            }
            const titleRect = title.getBoundingClientRect();
            const bodyRect = body.getBoundingClientRect();
            if (titleRect.height <= 0 || bodyRect.height <= 0) return null;
            // TipTap must be editable
            if (
              body.getAttribute('contenteditable') !== 'true' &&
              !(body as HTMLElement).isContentEditable
            ) {
              return null;
            }
            return `${titleRect.top}:${bodyRect.top}:${body.outerHTML.length}`;
          },
          { title: titleSel, body: bodySel },
        );

        if (!snapshot) {
          await new Promise((r) => setTimeout(r, 500));
          continue;
        }

        // Require two consecutive identical layouts so we don't fill mid-remount.
        if (snapshot === lastBodyKey) {
          return true;
        }
        lastBodyKey = snapshot;
      } catch {
        lastBodyKey = '';
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  }

  /**
   * Confirms publish by waiting for the creator "Published successfully" page
   * (EN or ZH). Returns true only when that confirmation UI is visible.
   */
  async waitForPublishSuccessConfirmation(
    page: Page,
    timeoutMs: number,
  ): Promise<{ confirmed: boolean; pageUrl: string }> {
    const phrases = [
      'Published successfully',
      '发布成功',
      '发布成功了',
      'Return immediately',
      '立即返回',
    ];
    try {
      await page.waitForFunction(
        (needles: string[]) => {
          const text = (document.body?.innerText ?? '').replace(/\s+/g, ' ');
          return needles.some((n) => text.includes(n));
        },
        { timeout: timeoutMs, polling: 500 },
        phrases,
      );
      return { confirmed: true, pageUrl: page.url() };
    } catch {
      return { confirmed: false, pageUrl: page.url() };
    }
  }

  async fillTitle(page: Page, title: string): Promise<void> {
    const sel = this.titleInputSelector();
    await page.waitForSelector(sel, { visible: true, timeout: 15_000 });
    const el = await page.$(sel);
    if (el) {
      await el.evaluate((node) =>
        (node as HTMLElement).scrollIntoView({ block: 'center' }),
      );
    }
    await page.click(sel);
    // Clear via keyboard so React/controlled inputs stay in sync.
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyA');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    if (title.trim()) {
      await page.type(sel, title, { delay: 25 });
    }
  }

  async fillBody(page: Page, caption: string): Promise<void> {
    const sel = this.bodyEditorSelector();
    const text = caption.trim();
    if (!text) return;
    await page.waitForSelector(sel, { visible: true, timeout: 15_000 });
    const el = await page.$(sel);
    if (el) {
      await el.evaluate((node) =>
        (node as HTMLElement).scrollIntoView({ block: 'center' }),
      );
    }
    await page.click(sel);
    await page.keyboard.down('Control');
    await page.keyboard.press('KeyA');
    await page.keyboard.up('Control');
    await page.keyboard.press('Backspace');
    // TipTap listens to beforeinput/insertText better than setting textContent.
    await page.keyboard.type(text, { delay: 8 });
  }

  /** Returns true when the TipTap body contains a non-trivial amount of text. */
  async readBodyText(page: Page): Promise<string> {
    const sel = this.bodyEditorSelector();
    return page.evaluate((selector) => {
      const el = document.querySelector(selector) as HTMLElement | null;
      return (el?.innerText ?? el?.textContent ?? '').trim();
    }, sel);
  }

  /**
   * Fill title + caption, then verify caption stuck. If the SPA remounted the
   * editor (common after video processing), wait and fill again.
   */
  async fillPublishFieldsWithRetry(
    page: Page,
    title: string,
    caption: string,
  ): Promise<void> {
    const expected = caption.trim();
    for (let attempt = 1; attempt <= 3; attempt++) {
      await this.fillTitle(page, title);
      await this.fillBody(page, caption);
      await new Promise((r) => setTimeout(r, 1000));

      if (!expected) return;
      const actual = await this.readBodyText(page);
      const matched =
        actual.length >= Math.min(20, expected.length) &&
        (actual.includes(expected.slice(0, 20)) ||
          expected.includes(actual.slice(0, 20)));
      if (matched) {
        this.logger.debug(
          `RedNote caption filled on attempt=${attempt} len=${actual.length}`,
        );
        return;
      }

      this.logger.warn(
        `RedNote caption missing after fill attempt=${attempt} (got len=${actual.length}); waiting for re-render`,
      );
      await this.waitForPublishFormReady(page, 30_000);
    }

    const finalText = await this.readBodyText(page);
    if (
      expected &&
      finalText.length < Math.min(10, expected.length)
    ) {
      throw new RedNoteSelectorMismatchError(
        'Could not fill RedNote caption — editor remounted or selectors changed',
      );
    }
  }

  /**
   * Extract a scannable QR as raw base64 (no data: prefix).
   * Prefers the real <img.qrcode-img> pixels — container screenshots are often
   * blank/too small to scan (seen as ~1–5KB captures).
   */
  async captureQrBase64(
    page: Page,
    _opts?: { preferImgOnly?: boolean },
  ): Promise<string | null> {
    // 1) In-page extract from the actual QR <img> (best for data: and same-origin).
    try {
      const fromDom = await page.evaluate(() => {
        const imgs = Array.from(
          document.querySelectorAll<HTMLImageElement>(
            'img.qrcode-img, .qrcode img, .qrcode-container img, img[class*="qrcode"]',
          ),
        );
        for (const img of imgs) {
          const style = window.getComputedStyle(img);
          if (
            style.display === 'none' ||
            style.visibility === 'hidden' ||
            Number(style.opacity) === 0
          ) {
            continue;
          }
          const rect = img.getBoundingClientRect();
          if (rect.width < 100 || rect.height < 100) continue;
          if (!img.src || img.naturalWidth < 80 || img.naturalHeight < 80) continue;

          if (img.src.startsWith('data:image')) {
            const comma = img.src.indexOf(',');
            if (comma >= 0) return img.src.slice(comma + 1);
          }

          // Rasterize via canvas for http(s) QR images (may fail if CORS-tainted).
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) continue;
            ctx.drawImage(img, 0, 0);
            const dataUrl = canvas.toDataURL('image/png');
            const comma = dataUrl.indexOf(',');
            if (comma >= 0) return dataUrl.slice(comma + 1);
          } catch {
            // tainted canvas — fall through to Puppeteer screenshot
          }
        }
        return null;
      });
      if (fromDom && this.isScannableQrBase64(fromDom)) return fromDom;
    } catch (err) {
      this.logger.debug(
        `QR DOM extract failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // 2) Puppeteer screenshot of the <img> / <canvas> only (not outer containers).
    const imgEl = await this.findVisibleQrElement(page, true);
    if (imgEl) {
      try {
        const buf = await imgEl.screenshot({
          encoding: 'base64',
          type: 'png',
        });
        if (typeof buf === 'string' && this.isScannableQrBase64(buf)) return buf;
      } catch (err) {
        this.logger.warn(
          `QR img screenshot failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        await imgEl.dispose().catch(() => undefined);
      }
    }

    // 3) Last resort: container — only accept if large enough to be a real QR.
    const boxEl = await this.findVisibleQrElement(page, false);
    if (boxEl) {
      try {
        const tag = await boxEl.evaluate((n) => n.tagName);
        if (tag === 'IMG' || tag === 'CANVAS') {
          const buf = await boxEl.screenshot({
            encoding: 'base64',
            type: 'png',
          });
          if (typeof buf === 'string' && this.isScannableQrBase64(buf)) return buf;
        } else {
          // Prefer an img inside the container
          const inner = await boxEl.$('img, canvas');
          if (inner) {
            const buf = await inner.screenshot({
              encoding: 'base64',
              type: 'png',
            });
            await inner.dispose().catch(() => undefined);
            if (typeof buf === 'string' && this.isScannableQrBase64(buf)) return buf;
          }
        }
      } catch (err) {
        this.logger.warn(
          `QR container screenshot failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        await boxEl.dispose().catch(() => undefined);
      }
    }

    return null;
  }

  /** Reject tiny/blank captures that phones cannot scan. */
  isScannableQrBase64(b64: string): boolean {
    // Real Xiaohongshu QR PNGs are typically >> 5KB base64; 1–2KB is a blank box.
    return Boolean(b64 && b64.length >= 5000);
  }
}
