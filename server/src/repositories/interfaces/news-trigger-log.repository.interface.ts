import type { Prisma } from '@prisma/client';
import type { NewsTriggerLog } from '@prisma/client';

export type NewsTriggerLogRecord = NewsTriggerLog;

export interface INewsTriggerLogRepository {
  create(data: Prisma.NewsTriggerLogCreateInput): Promise<NewsTriggerLogRecord>;
  findByRunId(runId: string): Promise<NewsTriggerLogRecord | null>;
  findLatestByGroup(group: string): Promise<NewsTriggerLogRecord | null>;
  updateByRunId(
    runId: string,
    data: Prisma.NewsTriggerLogUpdateInput,
  ): Promise<NewsTriggerLogRecord | null>;
}
