import {
  PipelineLogLevel as PrismaPipelineLogLevel,
  PipelineLogStatus as PrismaPipelineLogStatus,
} from '@prisma/client';
import { WorkflowNodeType } from '../../nodes/schemas/workflow-node.schema';

export const LogLevel = {
  ...PrismaPipelineLogLevel,
  Info: PrismaPipelineLogLevel.INFO,
  Warning: PrismaPipelineLogLevel.WARNING,
  Error: PrismaPipelineLogLevel.ERROR,
} as const;

export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

export const PipelineLogStatus = {
  ...PrismaPipelineLogStatus,
  Started: PrismaPipelineLogStatus.started,
  Completed: PrismaPipelineLogStatus.completed,
  Retrying: PrismaPipelineLogStatus.retrying,
  Failed: PrismaPipelineLogStatus.failed,
} as const;

export type PipelineLogStatus =
  (typeof PipelineLogStatus)[keyof typeof PipelineLogStatus];

export interface PipelineLog {
  logId: string;
  pipelineRef: string;
  workflowRef: string;
  nodeId: string;
  nodeType: WorkflowNodeType;
  order: number;
  level: LogLevel;
  status: PipelineLogStatus;
  message: string;
  retryCount: number;
  timestamp: Date;
  expiresAt: Date;
}

export type PipelineLogDocument = PipelineLog;
