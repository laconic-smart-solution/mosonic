export const REDNOTE_LOGIN_QUEUE = 'rednote-login';
export const REDNOTE_PUBLISH_QUEUE = 'rednote-publish';

export type RedNoteLoginJobData = {
  userId: string;
};

export type RedNotePublishJobData = {
  userId: string;
  postId: string;
  uploadId?: string;
  channel: string;
  caption: string;
  mediaUrls: string[];
  scheduledAt?: string | null;
};

export function rednoteLoginRoom(userId: string): string {
  return `rednote:login:${userId}`;
}

export function rednoteLoginLockKey(userId: string): string {
  return `rednote:login-lock:${userId}`;
}

export function rednotePublishLockKey(userId: string): string {
  return `rednote:publish-lock:${userId}`;
}

/** BullMQ custom job ids must not contain `:`. */
export function rednoteLoginJobId(userId: string): string {
  return `rednote-login-${userId}`;
}

export function rednotePublishJobId(postId: string): string {
  return `rednote-publish-${postId}`;
}
