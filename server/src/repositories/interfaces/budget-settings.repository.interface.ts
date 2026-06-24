import type { Prisma } from '@prisma/client';
import type { BudgetSettings } from '@prisma/client';

export type BudgetSettingsRecord = BudgetSettings;

export interface IBudgetSettingsRepository {
  findByUserId(userId: string): Promise<BudgetSettingsRecord | null>;
  upsertByUserId(
    userId: string,
    data: Omit<Prisma.BudgetSettingsCreateInput, 'userId'>,
  ): Promise<BudgetSettingsRecord>;
}
