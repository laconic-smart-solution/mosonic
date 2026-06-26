import type {
  PipelineNodeExecutionStatus,
  PipelineStatus,
  Prisma,
} from '@prisma/client';
import type { TenancyAuth } from '../../auth/tenancy.types';
import type { PreviousOutputs } from '../../nodes/types/node-execution.types';
import type {
  PipelineNodeExecution,
  PipelineRecord,
} from '../../domain/pipeline/pipeline.types';
import type { WorkflowGraphEdge } from '../../workflow/workflow-graph.util';

export interface IPipelineRepository {
  findById(
    pipelineId: string,
    auth?: TenancyAuth,
  ): Promise<PipelineRecord | null>;
  create(data: Prisma.PipelineCreateInput): Promise<PipelineRecord>;
  updateById(
    pipelineId: string,
    data: Prisma.PipelineUpdateInput,
    auth?: TenancyAuth,
  ): Promise<PipelineRecord | null>;
  findPage(
    filter: Prisma.PipelineWhereInput,
    page: number,
    limit: number,
    sortBy: string,
    sortOrder: 'asc' | 'desc',
  ): Promise<{ rows: PipelineRecord[]; total: number }>;
  count(where: Prisma.PipelineWhereInput): Promise<number>;
  aggregateStatusCounts(
    where: Prisma.PipelineWhereInput,
  ): Promise<Partial<Record<PipelineStatus, number>>>;
  distinctUserIdsSince(startedAtGte: Date): Promise<string[]>;
  claimCreditReconciliation(pipelineId: string): Promise<boolean>;
  markCreditsReconciled(pipelineId: string): Promise<void>;
  /** Atomically marks a running pipeline completed; returns false if already finalized. */
  claimPipelineFinalization(pipelineId: string): Promise<boolean>;
  findNodesSummaryByIds(
    pipelineIds: string[],
    auth?: TenancyAuth,
  ): Promise<
    Map<
      string,
      { nodes: Array<{ nodeId: string; type: string; order: number }> }
    >
  >;

  getEdgesForPipeline(pipeline: PipelineRecord): WorkflowGraphEdge[];
  updateNodeStatus(
    pipelineId: string,
    nodeId: string,
    status: PipelineNodeExecutionStatus,
    output?: Record<string, unknown>,
  ): Promise<void>;
  saveExternalJobId(
    pipelineId: string,
    nodeId: string,
    externalJobId: string,
  ): Promise<void>;
  clearExternalJobId(pipelineId: string, nodeId: string): Promise<void>;
  setNodeLastError(
    pipelineId: string,
    nodeId: string,
    lastError: string,
  ): Promise<void>;
  markNodeSkipped(pipelineId: string, nodeId: string): Promise<void>;
  resetNodeToPending(pipelineId: string, nodeId: string): Promise<void>;
  prepareNodeForReviewRegenerate(
    pipelineId: string,
    nodeId: string,
    options: {
      reviewRegeneratePrompt: string | null;
      clearOutput?: boolean;
    },
  ): Promise<void>;
  patchNode(
    pipelineId: string,
    nodeId: string,
    patch: Partial<PipelineNodeExecution>,
  ): Promise<void>;
  setPipelineStatus(
    pipelineId: string,
    status: PipelineStatus,
    options?: {
      completedAt?: Date;
      pausedNodeId?: string | null;
      pausedLaneId?: string | null;
    },
  ): Promise<void>;
  getNode(
    pipeline: PipelineRecord,
    nodeId: string,
  ): PipelineNodeExecution | undefined;
  buildPreviousOutputsUpToOrder(
    pipeline: PipelineRecord,
    upToOrder: number,
  ): PreviousOutputs;
  buildAncestorOutputs(
    pipeline: PipelineRecord,
    nodeId: string,
    edges?: WorkflowGraphEdge[],
  ): PreviousOutputs;
  allNodesTerminal(pipeline: PipelineRecord): boolean;
  hasAwaitingReview(pipeline: PipelineRecord): boolean;
}
