import {
  PipelineDispatchMode as PrismaPipelineDispatchMode,
  PipelineUserExecutionMode as PrismaPipelineUserExecutionMode,
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
  WaitingReview: PrismaPipelineNodeExecutionStatus.waiting_review,
} as const;

export type PipelineNodeExecutionStatus =
  (typeof PipelineNodeExecutionStatus)[keyof typeof PipelineNodeExecutionStatus];

/** Infrastructure: inline vs queue worker dispatch */
export const PipelineDispatchMode = {
  ...PrismaPipelineDispatchMode,
  Inline: PrismaPipelineDispatchMode.inline,
  Queue: PrismaPipelineDispatchMode.queue,
} as const;

export type PipelineDispatchMode =
  (typeof PipelineDispatchMode)[keyof typeof PipelineDispatchMode];

/** User review policy: auto vs step */
export const PipelineUserExecutionMode = {
  ...PrismaPipelineUserExecutionMode,
  Auto: PrismaPipelineUserExecutionMode.auto,
  Step: PrismaPipelineUserExecutionMode.step,
} as const;

export type PipelineUserExecutionMode =
  (typeof PipelineUserExecutionMode)[keyof typeof PipelineUserExecutionMode];

/** @deprecated Use PipelineDispatchMode */
export const PipelineExecutionMode = PipelineDispatchMode;
/** @deprecated Use PipelineDispatchMode */
export type PipelineExecutionMode = PipelineDispatchMode;

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
  reviewRegenerateCount?: number;
  reviewRegeneratePrompt?: string | null;
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
  /** Workflow template node IDs selected for step-mode review. */
  reviewNodeIds?: string[];
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
  dispatchMode: PipelineDispatchMode;
  executionMode: PipelineUserExecutionMode;
  graph: PipelineGraphSnapshot;
  ruleOverlay: PipelineRuleOverlay | null;
  metadata: PipelineMetadata;
  creditsCharged?: number;
  creditChargeBreakdown?: PipelineCreditChargeEntry[];
  creditsReconciled?: boolean;
}

export type PipelineDocument = Pipeline;
