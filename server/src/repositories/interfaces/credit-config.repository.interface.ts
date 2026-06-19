import type { Prisma } from '@prisma/client';
import type { CreditConfigRecord } from '../../domain/credit/credit.types';
import type { CreditConfigChangeHistoryEntry } from '../../domain/credit/credit.types';

export type { CreditConfigChangeHistoryEntry };

const CONFIG_SINGLETON_KEY = 'default';

export { CONFIG_SINGLETON_KEY };

export interface ICreditConfigRepository {
  findSingleton(): Promise<CreditConfigRecord | null>;
  createSingleton(
    data: Prisma.CreditConfigCreateInput,
  ): Promise<CreditConfigRecord>;
  upsertSingleton(
    data: {
      creditPriceUsd: number;
      marginTarget: number;
      basicUsersPerMonth: number;
    },
    historyEntry: CreditConfigChangeHistoryEntry,
  ): Promise<CreditConfigRecord>;
  updateOverhead(
    overheadFactor: number,
    derivedMargin: number,
  ): Promise<void>;
  migrateLegacyFields(
    set: Prisma.CreditConfigUpdateInput,
    unsetKeys: string[],
  ): Promise<void>;
}
