import { TIKTOK_PHOTO_SLIDESHOW_TITLE_MAX } from '../../platform/platform-limits';
import {
  assertTikTokPhotoCaptionForPublish,
  isTikTokPhotoMedia,
  isVideoMediaUrl,
  tiktokPhotoCaptionError,
} from './tiktok-publish.util';

describe('tiktok-publish.util', () => {
  it('detects photo vs video media', () => {
    expect(isVideoMediaUrl('https://x.com/a.mp4')).toBe(true);
    expect(isVideoMediaUrl('https://x.com/a.png')).toBe(false);
    expect(isTikTokPhotoMedia(['https://x.com/a.png'])).toBe(true);
    expect(isTikTokPhotoMedia(['https://x.com/a.mp4'])).toBe(false);
    expect(
      isTikTokPhotoMedia(['https://x.com/a.png', 'https://x.com/b.jpg']),
    ).toBe(true);
  });

  it('flags captions over 90 characters for photo posts', () => {
    const ok = 'a'.repeat(TIKTOK_PHOTO_SLIDESHOW_TITLE_MAX);
    const bad = 'a'.repeat(TIKTOK_PHOTO_SLIDESHOW_TITLE_MAX + 1);
    expect(tiktokPhotoCaptionError(ok)).toBeNull();
    expect(tiktokPhotoCaptionError(bad)).toMatch(/90 characters max/);
  });

  it('assertTikTokPhotoCaptionForPublish throws for long photo captions', () => {
    expect(() =>
      assertTikTokPhotoCaptionForPublish(
        'tiktok',
        'x'.repeat(91),
        'https://x.com/p.png',
        null,
      ),
    ).toThrow(/90 characters max/);

    expect(() =>
      assertTikTokPhotoCaptionForPublish('tiktok', 'x'.repeat(200), null, [
        'https://x.com/v.mp4',
      ]),
    ).not.toThrow();
  });
});
