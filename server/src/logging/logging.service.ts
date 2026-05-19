import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  LogLevel,
  PipelineLog,
  PipelineLogDocument,
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
    @InjectModel(PipelineLog.name)
    private readonly logModel: Model<PipelineLogDocument>,
  ) {}

  async findByPipelineRef(
    pipelineRef: string,
    limit = 500,
  ): Promise<PipelineLogDocument[]> {
    return this.logModel
      .find({ pipelineRef })
      .sort({ timestamp: 1 })
      .limit(limit)
      .exec();
  }

  async appendLog(dto: AppendPipelineLogDto): Promise<PipelineLogDocument> {
    return this.logModel.create({
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
