import { Inject, Injectable } from '@nestjs/common';
import type { PipelineLogRecord } from '../domain/pipeline/pipeline.types';
import type { IPipelineLogRepository } from '../repositories/interfaces/pipeline-log.repository.interface';
import { PIPELINE_LOG_REPOSITORY } from '../repositories/tokens';
import {
  LogLevel,
  PipelineLogStatus,
} from './schemas/pipeline-log.schema';
import type { WorkflowNodeType } from '../nodes/schemas/workflow-node.schema';

export interface AppendPipelineLogDto {
  pipelineRef: string;
  workflowRef: string;
  nodeId: string;
  nodeType: WorkflowNodeType;
  order: number;
  level: LogLevel;
  status: PipelineLogStatus;
  message: string;
  retryCount?: number;
  timestamp?: Date;
  expiresAt: Date;
}

@Injectable()
export class LoggingService {
  constructor(
    @Inject(PIPELINE_LOG_REPOSITORY)
    private readonly logs: IPipelineLogRepository,
  ) {}

  findByPipelineRef(
    pipelineRef: string,
    limit = 500,
  ): Promise<PipelineLogRecord[]> {
    return this.logs.findByPipelineRef(pipelineRef, limit);
  }

  appendLog(dto: AppendPipelineLogDto): Promise<PipelineLogRecord> {
    return this.logs.append({
      pipelineRef: dto.pipelineRef,
      workflowRef: dto.workflowRef,
      nodeId: dto.nodeId,
      nodeType: dto.nodeType,
      order: dto.order,
      level: dto.level,
      status: dto.status,
      message: dto.message,
      retryCount: dto.retryCount ?? 0,
      timestamp: dto.timestamp ?? new Date(),
      expiresAt: dto.expiresAt,
    });
  }
}
