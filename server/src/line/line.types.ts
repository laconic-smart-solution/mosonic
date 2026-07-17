/** Event shape forwarded by communication-service line-service to our callback. */
export type LineInboundEvent = {
  type: string;
  user_id: string;
  reply_token?: string;
  message_id?: string;
  text?: string;
};

export type LineQrCode = {
  basicId: string;
  addFriendUrl: string;
  qrImage: string;
};

export const LINE_EVENT_FOLLOW = 'follow';
export const LINE_EVENT_UNFOLLOW = 'unfollow';
export const LINE_EVENT_MESSAGE = 'message';
