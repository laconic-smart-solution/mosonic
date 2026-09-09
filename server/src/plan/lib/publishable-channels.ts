/**
 * The publishable channels that plan-tier access control gates. Mirrors
 * client/src/features/settings/constants/account-channels.ts (`id` values) —
 * keep the two in sync if this list ever changes. WhatsApp/Telegram/Viber/
 * LINE/WeChat are contact-only and are never gated by plan.
 */
export const PUBLISHABLE_CHANNELS = [
  'facebook',
  'instagram',
  'youtube',
  'linkedin',
  'tiktok',
  'rednote',
] as const;

export type PublishableChannel = (typeof PUBLISHABLE_CHANNELS)[number];
