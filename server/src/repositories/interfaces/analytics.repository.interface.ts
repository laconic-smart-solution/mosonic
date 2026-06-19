import type { Prisma } from '@prisma/client';
import type { Analytics } from '@prisma/client';

export type AnalyticsRecord = Analytics;

export interface IAnalyticsRepository {
  findByRuleRef(ruleRef: string): Promise<AnalyticsRecord | null>;
  upsert(
    ruleRef: string,
    data: Prisma.AnalyticsCreateInput,
  ): Promise<AnalyticsRecord>;
}
