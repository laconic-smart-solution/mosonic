export const ZERNIO_SCHEDULED_SYNC_LOCK_ID = 'zernio_scheduled_sync';

export interface SyncLock {
  _id: string;
  owner: string;
  expiresAt: Date;
}

export type SyncLockDocument = SyncLock;
