import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { ISyncLockRepository } from '../interfaces/sync-lock.repository.interface';

@Injectable()
export class PrismaSyncLockRepository implements ISyncLockRepository {
  constructor(private readonly prisma: PrismaService) {}

  async tryAcquire(
    lockId: string,
    owner: string,
    expiresAt: Date,
  ): Promise<boolean> {
    try {
      await this.prisma.syncLock.create({
        data: { id: lockId, owner, expiresAt },
      });
      return true;
    } catch {
      return false;
    }
  }

  async stealExpired(
    lockId: string,
    owner: string,
    expiresAt: Date,
    now: Date,
  ): Promise<boolean> {
    const result = await this.prisma.syncLock.updateMany({
      where: { id: lockId, expiresAt: { lte: now } },
      data: { owner, expiresAt },
    });
    return result.count > 0;
  }

  release(lockId: string): Promise<void> {
    return this.prisma.syncLock
      .deleteMany({ where: { id: lockId } })
      .then(() => undefined);
  }
}
