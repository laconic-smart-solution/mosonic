/** Event shape forwarded by communication-service telegram-service to our callback. */
export type TelegramInboundEvent = {
  type: string;
  user_id: string;
  message_id?: string;
  text?: string;
};

export type TelegramQrCode = {
  botUsername: string;
  botUrl: string;
  qrImage: string;
};

export const TELEGRAM_EVENT_FOLLOW = 'follow';
export const TELEGRAM_EVENT_UNFOLLOW = 'unfollow';
export const TELEGRAM_EVENT_MESSAGE = 'message';
