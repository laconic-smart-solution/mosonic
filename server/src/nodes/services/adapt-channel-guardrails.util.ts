import { TIKTOK_PHOTO_SLIDESHOW_TITLE_MAX } from '../../platform/platform-limits';

function normalizeChannelKey(channel: string): string {
  return channel.trim().toLowerCase();
}

/** Platform-specific instructions injected into adapt node system prompts. */
export function adaptChannelPromptGuardrails(channel: string): string[] {
  const key = normalizeChannelKey(channel);
  if (key !== 'tiktok') return [];

  return [
    '',
    '=== TIKTOK CONSTRAINTS (mandatory) ===',
    `TikTok photo and carousel posts use the post text as the slideshow title (hard limit: ${TIKTOK_PHOTO_SLIDESHOW_TITLE_MAX} characters).`,
    `Your adapted output MUST be ${TIKTOK_PHOTO_SLIDESHOW_TITLE_MAX} characters or fewer — count every character including spaces, punctuation, emojis, and hashtags.`,
    'Write one punchy single-line caption: strong hook + brand CTA. No line breaks.',
    'Drop secondary details; prioritize one clear message that fits the limit.',
  ];
}

/** Extra human-message reminder for strict platforms. */
export function adaptChannelHumanReminder(channel: string): string | null {
  if (normalizeChannelKey(channel) !== 'tiktok') return null;
  return `Hard limit: ${TIKTOK_PHOTO_SLIDESHOW_TITLE_MAX} characters or fewer (TikTok slideshow title).`;
}

/**
 * Safety net after LLM generation — keeps TikTok adapt output publishable for photo posts.
 */
export function enforceAdaptChannelLimits(
  channel: string,
  text: string,
): string {
  const key = normalizeChannelKey(channel);
  if (key !== 'tiktok') return text;

  const singleLine = text.replace(/\s+/g, ' ').trim();
  if (singleLine.length <= TIKTOK_PHOTO_SLIDESHOW_TITLE_MAX) return singleLine;

  let cut = singleLine.slice(0, TIKTOK_PHOTO_SLIDESHOW_TITLE_MAX);
  const lastSpace = cut.lastIndexOf(' ');
  if (lastSpace > Math.floor(TIKTOK_PHOTO_SLIDESHOW_TITLE_MAX * 0.65)) {
    cut = cut.slice(0, lastSpace);
  }
  return cut.trimEnd();
}
