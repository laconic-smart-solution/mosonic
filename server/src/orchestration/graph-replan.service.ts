import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { WorkflowNodeType } from '../nodes/schemas/workflow-node.schema';
import {
  parsePipelineGraph,
  parsePipelineNodes,
} from '../repositories/prisma/pipeline-nodes.util';
import type { IPipelineRepository } from '../repositories/interfaces/pipeline.repository.interface';
import { PIPELINE_REPOSITORY } from '../repositories/tokens';
import {
  PipelineNodeExecutionStatus,
  PipelineStatus,
} from '../pipeline/schemas/pipeline.schema';
import { DependencyResolverService } from './dependency-resolver.service';
import type { PipelineNodeExecution } from '../domain/pipeline/pipeline.types';

export type ReplanOperation =
  | { op: 'skip_node'; nodeId: string }
  | { op: 'retry_node'; nodeId: string }
  | { op: 'remove_pending_node'; nodeId: string }
  | {
      op: 'insert_node';
      afterNodeId: string;
      spec: {
        type: WorkflowNodeType;
        lane?: string | null;
        config?: Record<string, unknown>;
      };
    };

@Injectable()
export class GraphReplanService {
  constructor(
    @Inject(PIPELINE_REPOSITORY)
    private readonly pipelines: IPipelineRepository,
    private readonly resolver: DependencyResolverService,
  ) {}

  async replan(
    pipelineId: string,
    operations: ReplanOperation[],
  ): Promise<{ success: boolean; nodeCount: number }> {
    const pipeline = await this.pipelines.findById(pipelineId);
    if (!pipeline) {
      throw new NotFoundException(`Pipeline ${pipelineId} not found`);
    }
    if (pipeline.status !== PipelineStatus.Paused) {
      throw new BadRequestException('Replan is only allowed when pipeline is paused');
    }

    let nodes = [...parsePipelineNodes(pipeline.nodes)];
    const graph = parsePipelineGraph(pipeline.graph);
    let edges = [...(graph.edges ?? [])];

    for (const op of operations) {
      if (op.op === 'skip_node') {
        const node = nodes.find((n) => n.nodeId === op.nodeId);
        if (!node) {
          throw new BadRequestException(`Node ${op.nodeId} not found`);
        }
        if (node.status === PipelineNodeExecutionStatus.Completed) {
          throw new BadRequestException('Cannot skip completed node');
        }
        node.status = PipelineNodeExecutionStatus.Skipped;
      } else if (op.op === 'retry_node') {
        const node = nodes.find((n) => n.nodeId === op.nodeId);
        if (!node) {
          throw new BadRequestException(`Node ${op.nodeId} not found`);
        }
        node.status = PipelineNodeExecutionStatus.Pending;
        node.output = null;
        node.retryCount = 0;
      } else if (op.op === 'remove_pending_node') {
        const node = nodes.find((n) => n.nodeId === op.nodeId);
        if (!node) {
          throw new BadRequestException(`Node ${op.nodeId} not found`);
        }
        if (node.status !== PipelineNodeExecutionStatus.Pending) {
          throw new BadRequestException('Can only remove pending nodes');
        }
        nodes = nodes.filter((n) => n.nodeId !== op.nodeId);
        edges = edges.filter(
          (e) => e.from !== op.nodeId && e.to !== op.nodeId,
        );
      } else if (op.op === 'insert_node') {
        const after = nodes.find((n) => n.nodeId === op.afterNodeId);
        if (!after) {
          throw new BadRequestException(`Node ${op.afterNodeId} not found`);
        }
        const newId = `repl_${randomUUID().slice(0, 8)}`;
        const order = after.order + 0.5;
        nodes.push({
          nodeId: newId,
          type: op.spec.type,
          order,
          isLocked: false,
          userPrompt: '',
          config: op.spec.config ?? {},
          status: PipelineNodeExecutionStatus.Pending,
          input: '',
          output: null,
          retryCount: 0,
          executedAt: null,
          lane: op.spec.lane ?? after.lane ?? null,
          variantId: after.variantId ?? null,
          lastError: null,
          externalJobId: null,
        } as PipelineNodeExecution);
        edges.push({ from: op.afterNodeId, to: newId });
        const outbound = edges.filter((e) => e.from === op.afterNodeId && e.to !== newId);
        for (const edge of outbound) {
          edges.push({ from: newId, to: edge.to });
        }
        edges = edges.filter(
          (e) => !(e.from === op.afterNodeId && outbound.some((o) => o.to === e.to)),
        );
      }
    }

    nodes.sort((a, b) => a.order - b.order);
    nodes.forEach((n, i) => {
      n.order = i + 1;
    });

    await this.pipelines.updateById(pipelineId, {
      nodes: nodes as Prisma.InputJsonValue,
      graph: { ...graph, edges } as Prisma.InputJsonValue,
      status: PipelineStatus.Running,
      pausedNodeId: null,
      pausedLaneId: null,
    });

    await this.resolver.enqueueReadyNodes(pipelineId);

    return { success: true, nodeCount: nodes.length };
  }
}
