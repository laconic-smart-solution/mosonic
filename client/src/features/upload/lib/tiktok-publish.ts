/** TikTok photo/slideshow posts use post content as the title (Zernio / TikTok API limit). */
export const TIKTOK_PHOTO_SLIDESHOW_TITLE_MAX = 90;

export function isVideoMediaUrl(url: string): boolean {
  return /\.(mp4|webm|mov|m4v|mkv)(\?|$)/i.test(url.trim());
}

export function isTikTokPhotoMedia(mediaUrls: string[]): boolean {
  const urls = mediaUrls.map((u) => u.trim()).filter(Boolean);
  if (urls.length === 0) return false;
  return urls.every((u) => !isVideoMediaUrl(u));
}

export function tiktokPhotoCaptionError(caption: string): string | null {
  const trimmed = caption.trim();
  if (trimmed.length <= TIKTOK_PHOTO_SLIDESHOW_TITLE_MAX) return null;
  const over = trimmed.length - TIKTOK_PHOTO_SLIDESHOW_TITLE_MAX;
  return `TikTok photo posts use your caption as the slideshow title (${TIKTOK_PHOTO_SLIDESHOW_TITLE_MAX} characters max). Shorten by ${over} character${over === 1 ? '' : 's'}.`;
}

export function tiktokPhotoCaptionErrorI18n(
  caption: string,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string | null {
  const trimmed = caption.trim();
  if (trimmed.length <= TIKTOK_PHOTO_SLIDESHOW_TITLE_MAX) return null;
  return t('upload:tiktok.slideshowTitleTooLong', {
    max: TIKTOK_PHOTO_SLIDESHOW_TITLE_MAX,
    count: trimmed.length,
    over: trimmed.length - TIKTOK_PHOTO_SLIDESHOW_TITLE_MAX,
  });
}
