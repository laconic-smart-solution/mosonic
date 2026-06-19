export { BudgetOnLimitHit } from '@prisma/client';

import type { BudgetOnLimitHit } from '@prisma/client';

export const BUDGET_LIMIT_ACTIONS = ['warn', 'stop'] as const;
export type BudgetLimitAction = BudgetOnLimitHit;

export interface BudgetSettings {
  userId: string;
  monthlyLimitUsd?: number;
  warningThresholdPct: number;
  onMonthlyLimitHit: BudgetLimitAction;
  perRunLimitUsd?: number;
  onRunLimitHit: BudgetLimitAction;
  emailAlerts: boolean;
  inAppAlerts: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export type BudgetSettingsDocument = BudgetSettings;
