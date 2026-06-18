import { TIKTOK_PHOTO_SLIDESHOW_TITLE_MAX } from '../../platform/platform-limits';

export function isVideoMediaUrl(url: string): boolean {
  return /\.(mp4|webm|mov|m4v|mkv)(\?|$)/i.test(url.trim());
}

/** True when every attached URL is a non-video asset (photo carousel / slideshow). */
export function isTikTokPhotoMedia(mediaUrls: string[]): boolean {
  const urls = mediaUrls.map((u) => u.trim()).filter(Boolean);
  if (urls.length === 0) return false;
  return urls.every((u) => !isVideoMediaUrl(u));
}

export function resolvePlatformMediaUrls(
  mediaUrl: string | null | undefined,
  mediaUrls: string[] | null | undefined,
): string[] {
  const multi = (mediaUrls ?? [])
    .map((u) => u.trim())
    .filter(Boolean);
  if (multi.length > 0) return multi;
  const single = (mediaUrl ?? '').trim();
  if (!single) return [];
  return single
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean);
}

export function tiktokPhotoCaptionError(caption: string): string | null {
  const trimmed = caption.trim();
  if (trimmed.length <= TIKTOK_PHOTO_SLIDESHOW_TITLE_MAX) return null;
  const over = trimmed.length - TIKTOK_PHOTO_SLIDESHOW_TITLE_MAX;
  return `TikTok photo posts use your caption as the slideshow title (${TIKTOK_PHOTO_SLIDESHOW_TITLE_MAX} characters max). Shorten by ${over} character${over === 1 ? '' : 's'}.`;
}

export function assertTikTokPhotoCaptionForPublish(
  platform: string,
  caption: string,
  mediaUrl: string | null | undefined,
  mediaUrls: string[] | null | undefined,
): void {
  if (platform.trim().toLowerCase() !== 'tiktok') return;
  const urls = resolvePlatformMediaUrls(mediaUrl, mediaUrls);
  if (!isTikTokPhotoMedia(urls)) return;
  const err = tiktokPhotoCaptionError(caption);
  if (err) throw new Error(err);
}
