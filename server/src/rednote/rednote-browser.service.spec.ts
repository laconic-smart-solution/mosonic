jest.mock('puppeteer', () => ({
  __esModule: true,
  default: { launch: jest.fn() },
}));

import { ConfigService } from '@nestjs/config';
import { RedNoteBrowserService } from './rednote-browser.service';

describe('RedNoteBrowserService login selectors', () => {
  const emptyConfig = {
    get: () => undefined,
  } as unknown as ConfigService;
  const browser = new RedNoteBrowserService(emptyConfig);

  it('defaults to explore URL and multi trigger selectors', () => {
    expect(browser.loginUrl()).toBe('https://www.xiaohongshu.com/explore');
    expect(browser.loginTriggerSelectors()[0]).toBe('#login-btn button');
    expect(browser.loginTriggerSelectors()).toContain('#login-btn');
    expect(browser.loginTriggerSelectors()).toContain('.login-btn');
    expect(browser.loginModalSelector()).toContain('.reds-modal.login-modal');
    expect(browser.qrSelector()).toContain('img.qrcode-img');
    expect(browser.qrContainerSelectors()[0]).toContain('force-light');
  });

  it('isQrLoginSucceeded is true when modal is absent', async () => {
    const page = {
      $: jest.fn().mockResolvedValue(null),
    };
    await expect(
      browser.isQrLoginSucceeded(page as never),
    ).resolves.toBe(true);
  });

  it('isQrLoginSucceeded is false when modal is present', async () => {
    const page = {
      $: jest.fn().mockResolvedValue({}),
    };
    await expect(
      browser.isQrLoginSucceeded(page as never),
    ).resolves.toBe(false);
  });

  it('defaults creator publish selectors', () => {
    expect(browser.creatorLoggedInAvatarSelector()).toContain('user_avatar');
    expect(browser.videoUploadInputSelector()).toContain('.mp4');
    expect(browser.publishButtonHostSelector()).toContain('xhs-publish-btn');
    expect(browser.publishButtonSelectors()[0]).toBe('xhs-publish-btn');
    expect(browser.publishSuccessTimeoutMs()).toBe(60_000);
    expect(
      browser.isCreatorCenterUrl(
        'https://creator.xiaohongshu.com/publish/publish',
      ),
    ).toBe(true);
    expect(
      browser.isCreatorCenterUrl('https://creator.rednote.com/publish/publish'),
    ).toBe(true);
  });

  it('isCreatorLoggedIn checks avatar selector', async () => {
    const page = {
      $: jest.fn().mockResolvedValue({}),
    };
    await expect(browser.isCreatorLoggedIn(page as never)).resolves.toBe(true);
    expect(page.$).toHaveBeenCalledWith(
      '.d-topbar-default .user-info img.user_avatar',
    );
  });

  it('isLoggedIn on creator URL uses avatar check only', async () => {
    const page = {
      url: () => 'https://creator.xiaohongshu.com/publish/publish',
      $: jest.fn().mockResolvedValue(null),
    };
    await expect(browser.isLoggedIn(page as never)).resolves.toBe(false);
    expect(page.$).toHaveBeenCalledWith(
      '.d-topbar-default .user-info img.user_avatar',
    );
  });
});
