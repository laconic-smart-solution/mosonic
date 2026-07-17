/** Event shape forwarded by communication-service viber-service to our callback. */
export type ViberInboundEvent = {
  type: string;
  user_id: string;
  message_id?: string;
  text?: string;
};

export type ViberQrCode = {
  uri: string;
  botUrl: string;
  qrImage: string;
};

export const VIBER_EVENT_FOLLOW = 'follow';
export const VIBER_EVENT_UNFOLLOW = 'unfollow';
export const VIBER_EVENT_MESSAGE = 'message';
