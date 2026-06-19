import type { Pipeline, PipelineLog, PipelineNodeExecutionStatus, PipelineStatus } from '@prisma/client';

export { PipelineNodeExecutionStatus, PipelineStatus };

export type PipelineRecord = Pipeline;

export type PipelineNodeExecution = {
  nodeId: string;
  type: string;
  order: number;
  isLocked: boolean;
  userPrompt: string;
  config: Record<string, unknown>;
  status: PipelineNodeExecutionStatus;
  input: string;
  output: string | null;
  retryCount: number;
  executedAt: string | Date | null;
  lane: string | null;
  variantId: string | null;
  lastError: string | null;
  externalJobId: string | null;
};

export type PipelineGraphSnapshot = {
  edges?: Array<{ from: string; to: string; sourceHandle?: string; targetHandle?: string }>;
  materializedFromWorkflowVersion?: number;
  lanes?: string[];
  layout?: Record<string, { x: number; y: number }>;
};

export type PipelineLogRecord = PipelineLog;
