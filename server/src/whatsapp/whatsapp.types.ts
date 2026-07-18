/** Event shape forwarded by communication-service whatsapp-service to our callback. */
export type WhatsAppInboundEvent = {
  type: string;
  user_id: string;
  message_id?: string;
  text?: string;
};

export type WhatsAppQrCode = {
  phone: string;
  chatUrl: string;
  qrImage: string;
};

export const WHATSAPP_EVENT_FOLLOW = 'follow';
export const WHATSAPP_EVENT_UNFOLLOW = 'unfollow';
export const WHATSAPP_EVENT_MESSAGE = 'message';
