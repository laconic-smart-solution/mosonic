import { Injectable } from '@nestjs/common';
import type {
  PipelineNodeExecutionStatus,
  PipelineStatus,
  Prisma,
} from '@prisma/client';
import type { TenancyAuth } from '../../auth/tenancy.types';
import { UserRole } from '../../domain/users/user.types';
import { PrismaService } from '../../database/prisma.service';
import type { PreviousOutputs } from '../../nodes/types/node-execution.types';
import { mergeParsedIntoPreviousOutputs } from '../../pipeline/pipeline-output-merge.util';
import { parsePipelineNodeOutputString } from '../../pipeline/pipeline-output-parse';
import {
  buildLinearEdgesFromOrder,
  getAncestorsForLane,
  topologicalSort,
  type WorkflowGraphEdge,
} from '../../workflow/workflow-graph.util';
import type {
  PipelineNodeExecution,
  PipelineRecord,
} from '../../domain/pipeline/pipeline.types';
import type { IPipelineRepository } from '../interfaces/pipeline.repository.interface';
import {
  applyNodeStatusUpdate,
  parsePipelineGraph,
  parsePipelineNodes,
  updatePipelineNode,
} from './pipeline-nodes.util';
import { mergeTenancyWhere } from './prisma.util';

@Injectable()
export class PrismaPipelineRepository implements IPipelineRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(
    pipelineId: string,
    auth?: TenancyAuth,
  ): Promise<PipelineRecord | null> {
    const where = auth
      ? mergeTenancyWhere({ pipelineId }, auth)
      : { pipelineId };
    return this.prisma.pipeline.findFirst({ where });
  }

  create(data: Prisma.PipelineCreateInput): Promise<PipelineRecord> {
    return this.prisma.pipeline.create({ data });
  }

  async updateById(
    pipelineId: string,
    data: Prisma.PipelineUpdateInput,
    auth?: TenancyAuth,
  ): Promise<PipelineRecord | null> {
    const existing = await this.findById(pipelineId, auth);
    if (!existing) return null;
    return this.prisma.pipeline.update({ where: { pipelineId }, data });
  }

  async findPage(
    filter: Prisma.PipelineWhereInput,
    page: number,
    limit: number,
    sortBy: string,
    sortOrder: 'asc' | 'desc',
  ): Promise<{ rows: PipelineRecord[]; total: number }> {
    const orderBy = { [sortBy]: sortOrder } as Prisma.PipelineOrderByWithRelationInput;
    const [rows, total] = await Promise.all([
      this.prisma.pipeline.findMany({
        where: filter,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.pipeline.count({ where: filter }),
    ]);
    return { rows, total };
  }

  count(where: Prisma.PipelineWhereInput): Promise<number> {
    return this.prisma.pipeline.count({ where });
  }

  async aggregateStatusCounts(
    where: Prisma.PipelineWhereInput,
  ): Promise<Partial<Record<PipelineStatus, number>>> {
    const rows = await this.prisma.pipeline.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    });
    const out: Partial<Record<PipelineStatus, number>> = {};
    for (const row of rows) {
      out[row.status] = row._count._all;
    }
    return out;
  }

  async distinctUserIdsSince(startedAtGte: Date): Promise<string[]> {
    const rows = await this.prisma.pipeline.findMany({
      where: { startedAt: { gte: startedAtGte }, userId: { not: null } },
      select: { userId: true },
      distinct: ['userId'],
    });
    return rows.map((r) => r.userId!).filter(Boolean);
  }

  async claimCreditReconciliation(pipelineId: string): Promise<boolean> {
    const result = await this.prisma.pipeline.updateMany({
      where: { pipelineId, creditsReconciled: { not: true } },
      data: { creditsReconciled: true },
    });
    return result.count > 0;
  }

  markCreditsReconciled(pipelineId: string): Promise<void> {
    return this.prisma.pipeline
      .update({
        where: { pipelineId },
        data: { creditsReconciled: true },
      })
      .then(() => undefined);
  }

  async findNodesSummaryByIds(
    pipelineIds: string[],
    auth?: TenancyAuth,
  ): Promise<
    Map<
      string,
      { nodes: Array<{ nodeId: string; type: string; order: number }> }
    >
  > {
    const where: Prisma.PipelineWhereInput = { pipelineId: { in: pipelineIds } };
    if (auth && auth.role !== UserRole.ADMIN) {
      where.OR = [
        { userId: auth.userId },
        { userId: null },
      ];
    }
    const pipelines = await this.prisma.pipeline.findMany({
      where,
      select: { pipelineId: true, nodes: true },
    });
    const out = new Map<
      string,
      { nodes: Array<{ nodeId: string; type: string; order: number }> }
    >();
    for (const p of pipelines) {
      const nodes = parsePipelineNodes(p.nodes).map((n) => ({
        nodeId: n.nodeId,
        type: String(n.type),
        order: n.order,
      }));
      out.set(p.pipelineId, { nodes });
    }
    return out;
  }

  getEdgesForPipeline(pipeline: PipelineRecord): WorkflowGraphEdge[] {
    const graph = parsePipelineGraph(pipeline.graph);
    const stored = graph.edges ?? [];
    if (stored.length > 0) {
      return stored.map((e) => ({ from: e.from, to: e.to }));
    }
    const nodes = parsePipelineNodes(pipeline.nodes);
    return buildLinearEdgesFromOrder(
      nodes.map((n) => ({ nodeId: n.nodeId, order: n.order })),
    );
  }

  private async mutateNode(
    pipelineId: string,
    nodeId: string,
    mutator: (nodes: PipelineNodeExecution[]) => PipelineNodeExecution[],
  ): Promise<void> {
    const pipeline = await this.prisma.pipeline.findUnique({
      where: { pipelineId },
    });
    if (!pipeline) return;
    const nodes = mutator(parsePipelineNodes(pipeline.nodes));
    await this.prisma.pipeline.update({
      where: { pipelineId },
      data: { nodes: nodes as Prisma.InputJsonValue },
    });
  }

  updateNodeStatus(
    pipelineId: string,
    nodeId: string,
    status: PipelineNodeExecutionStatus,
    output?: Record<string, unknown>,
  ): Promise<void> {
    return this.mutateNode(pipelineId, nodeId, (nodes) =>
      applyNodeStatusUpdate(nodes, nodeId, status, output),
    );
  }

  saveExternalJobId(
    pipelineId: string,
    nodeId: string,
    externalJobId: string,
  ): Promise<void> {
    return this.mutateNode(pipelineId, nodeId, (nodes) =>
      updatePipelineNode(nodes, nodeId, { externalJobId }),
    );
  }

  clearExternalJobId(pipelineId: string, nodeId: string): Promise<void> {
    return this.mutateNode(pipelineId, nodeId, (nodes) =>
      updatePipelineNode(nodes, nodeId, { externalJobId: null }),
    );
  }

  setNodeLastError(
    pipelineId: string,
    nodeId: string,
    lastError: string,
  ): Promise<void> {
    return this.mutateNode(pipelineId, nodeId, (nodes) =>
      updatePipelineNode(nodes, nodeId, {
        lastError: lastError.slice(0, 2000),
      }),
    );
  }

  markNodeSkipped(pipelineId: string, nodeId: string): Promise<void> {
    return this.mutateNode(pipelineId, nodeId, (nodes) =>
      updatePipelineNode(nodes, nodeId, {
        status: 'skipped',
        executedAt: new Date().toISOString(),
      }),
    );
  }

  resetNodeToPending(pipelineId: string, nodeId: string): Promise<void> {
    return this.mutateNode(pipelineId, nodeId, (nodes) =>
      updatePipelineNode(nodes, nodeId, { status: 'pending' }),
    );
  }

  async setPipelineStatus(
    pipelineId: string,
    status: PipelineStatus,
    options?: {
      completedAt?: Date;
      pausedNodeId?: string | null;
      pausedLaneId?: string | null;
    },
  ): Promise<void> {
    const data: Prisma.PipelineUpdateInput = { status };
    if (options?.completedAt) data.completedAt = options.completedAt;
    if (options && 'pausedNodeId' in options) {
      data.pausedNodeId = options.pausedNodeId;
    }
    if (options && 'pausedLaneId' in options) {
      data.pausedLaneId = options.pausedLaneId;
    }
    await this.prisma.pipeline.update({ where: { pipelineId }, data });
  }

  getNode(
    pipeline: PipelineRecord,
    nodeId: string,
  ): PipelineNodeExecution | undefined {
    return parsePipelineNodes(pipeline.nodes).find((n) => n.nodeId === nodeId);
  }

  buildPreviousOutputsUpToOrder(
    pipeline: PipelineRecord,
    upToOrder: number,
  ): PreviousOutputs {
    const previousOutputs: PreviousOutputs = {};
    const sorted = [...parsePipelineNodes(pipeline.nodes)].sort(
      (a, b) => a.order - b.order,
    );
    for (const node of sorted) {
      if (node.order >= upToOrder) break;
      if (node.status !== 'completed' && node.status !== 'skipped') continue;
      const parsed = parsePipelineNodeOutputString(node.output);
      if (parsed) mergeParsedIntoPreviousOutputs(previousOutputs, parsed);
    }
    return previousOutputs;
  }

  buildAncestorOutputs(
    pipeline: PipelineRecord,
    nodeId: string,
    edges?: WorkflowGraphEdge[],
  ): PreviousOutputs {
    const graphEdges = edges ?? this.getEdgesForPipeline(pipeline);
    const target = this.getNode(pipeline, nodeId);
    const nodes = parsePipelineNodes(pipeline.nodes);
    const nodesById = new Map(
      nodes.map((n) => [n.nodeId, { nodeId: n.nodeId, lane: n.lane ?? null }]),
    );
    const ancestors = getAncestorsForLane(
      graphEdges,
      nodeId,
      target?.lane ?? null,
      nodesById,
    );
    const ancestorIds = topologicalSort([...ancestors], graphEdges);
    const previousOutputs: PreviousOutputs = {};
    for (const ancestorId of ancestorIds) {
      const node = this.getNode(pipeline, ancestorId);
      if (!node) continue;
      if (node.status !== 'completed' && node.status !== 'skipped') continue;
      const parsed = parsePipelineNodeOutputString(node.output);
      if (parsed) mergeParsedIntoPreviousOutputs(previousOutputs, parsed);
    }
    return previousOutputs;
  }

  allNodesTerminal(pipeline: PipelineRecord): boolean {
    return parsePipelineNodes(pipeline.nodes).every(
      (n) => n.status === 'completed' || n.status === 'skipped',
    );
  }
}
