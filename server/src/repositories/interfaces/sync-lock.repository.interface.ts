export interface ISyncLockRepository {
  tryAcquire(lockId: string, owner: string, expiresAt: Date): Promise<boolean>;
  stealExpired(
    lockId: string,
    owner: string,
    expiresAt: Date,
    now: Date,
  ): Promise<boolean>;
  release(lockId: string): Promise<void>;
}
