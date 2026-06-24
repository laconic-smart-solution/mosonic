import {
  PipelineExecutionMode as PrismaPipelineExecutionMode,
  PipelineNodeExecutionStatus as PrismaPipelineNodeExecutionStatus,
  PipelineStatus as PrismaPipelineStatus,
} from '@prisma/client';
import { WorkflowNodeType } from '../../nodes/schemas/workflow-node.schema';
import type { WorkflowEdgeEntry } from '../../workflow/schemas/workflow-edge.schema';

export const PipelineStatus = {
  ...PrismaPipelineStatus,
  Running: PrismaPipelineStatus.running,
  Completed: PrismaPipelineStatus.completed,
  Failed: PrismaPipelineStatus.failed,
  Paused: PrismaPipelineStatus.paused,
} as const;

export type PipelineStatus =
  (typeof PipelineStatus)[keyof typeof PipelineStatus];

export const PipelineNodeExecutionStatus = {
  ...PrismaPipelineNodeExecutionStatus,
  Pending: PrismaPipelineNodeExecutionStatus.pending,
  Running: PrismaPipelineNodeExecutionStatus.running,
  Completed: PrismaPipelineNodeExecutionStatus.completed,
  Failed: PrismaPipelineNodeExecutionStatus.failed,
  Skipped: PrismaPipelineNodeExecutionStatus.skipped,
} as const;

export type PipelineNodeExecutionStatus =
  (typeof PipelineNodeExecutionStatus)[keyof typeof PipelineNodeExecutionStatus];

export const PipelineExecutionMode = {
  ...PrismaPipelineExecutionMode,
  Inline: PrismaPipelineExecutionMode.inline,
  Queue: PrismaPipelineExecutionMode.queue,
} as const;

export type PipelineExecutionMode =
  (typeof PipelineExecutionMode)[keyof typeof PipelineExecutionMode];

export interface PipelineNodeExecution {
  nodeId: string;
  type: WorkflowNodeType;
  order: number;
  isLocked: boolean;
  userPrompt: string;
  config: Record<string, unknown>;
  status: PipelineNodeExecutionStatus;
  input: string;
  output: string | null;
  retryCount: number;
  executedAt: Date | null;
  lane: string | null;
  variantId: string | null;
  lastError: string | null;
  externalJobId: string | null;
}

export interface PipelineGraphSnapshot {
  edges: WorkflowEdgeEntry[];
  materializedFromWorkflowVersion?: number;
  lanes: string[];
  layout: Record<string, { x: number; y: number }>;
}

export interface PipelineRuleOverlay {
  baseRuleVersion: number;
  appliedSuggestionIds: string[];
  patches: Array<{ field: string; suggestedValue: unknown }>;
  analyticsSnapshotAt: Date;
}

export interface PipelineNewsMeta {
  title: string;
  url: string;
  sourceId: string;
  publishedAt: string;
  relevanceScore: number;
  suggestedAngle: string;
}

export interface PipelineMetadata {
  source?: 'manual' | 'scheduler' | 'integration' | 'news';
  scheduleId?: string;
  experimentId?: string;
  newsMeta: PipelineNewsMeta | null;
}

export interface PipelineCreditChargeEntry {
  nodeType: string;
  count: number;
  creditsEach: number;
}

export interface Pipeline {
  pipelineId: string;
  userId?: string;
  workflowRef: string;
  ruleRef: string;
  contentPrompt: string;
  name: string;
  nodes: PipelineNodeExecution[];
  status: PipelineStatus;
  startedAt: Date;
  completedAt: Date | null;
  pausedNodeId: string | null;
  pausedLaneId: string | null;
  executionMode: PipelineExecutionMode;
  graph: PipelineGraphSnapshot;
  ruleOverlay: PipelineRuleOverlay | null;
  metadata: PipelineMetadata;
  creditsCharged?: number;
  creditChargeBreakdown?: PipelineCreditChargeEntry[];
  creditsReconciled?: boolean;
}

export type PipelineDocument = Pipeline;
