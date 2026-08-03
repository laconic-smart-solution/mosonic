/** Event shape forwarded by communication-service wechat-service to our callback. */
export type WechatInboundEvent = {
  type: string;
  user_id: string;
  message_id?: string;
  text?: string;
  /** Scene string for SCAN / subscribe-with-QR. */
  event_key?: string;
};

export type WechatQrCode = {
  sceneStr: string;
  chatUrl: string;
  qrImage: string;
};

export const WECHAT_EVENT_FOLLOW = 'follow';
export const WECHAT_EVENT_UNFOLLOW = 'unfollow';
export const WECHAT_EVENT_MESSAGE = 'message';
export const WECHAT_EVENT_SCAN = 'scan';
