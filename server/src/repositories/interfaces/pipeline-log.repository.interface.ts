import type { Prisma } from '@prisma/client';
import type { PipelineLogRecord } from '../../domain/pipeline/pipeline.types';

export type AppendPipelineLogInput = {
  pipelineRef: string;
  workflowRef: string;
  nodeId: string;
  nodeType: Prisma.PipelineLogCreateInput['nodeType'];
  order: number;
  level: Prisma.PipelineLogCreateInput['level'];
  status: Prisma.PipelineLogCreateInput['status'];
  message: string;
  retryCount?: number;
  timestamp?: Date;
  expiresAt: Date;
};

export interface IPipelineLogRepository {
  findByPipelineRef(
    pipelineRef: string,
    limit?: number,
  ): Promise<PipelineLogRecord[]>;
  append(dto: AppendPipelineLogInput): Promise<PipelineLogRecord>;
}
