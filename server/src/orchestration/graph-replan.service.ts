import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WorkflowNodeType } from '../nodes/schemas/workflow-node.schema';
import { PipelineRepository } from '../pipeline/pipeline.repository';
import {
  Pipeline,
  PipelineNodeExecutionStatus,
  PipelineStatus,
  type PipelineDocument,
} from '../pipeline/schemas/pipeline.schema';
import { DependencyResolverService } from './dependency-resolver.service';
import { randomUUID } from 'node:crypto';

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
    @InjectModel(Pipeline.name)
    private readonly pipelineModel: Model<PipelineDocument>,
    private readonly pipelineRepo: PipelineRepository,
    private readonly resolver: DependencyResolverService,
  ) {}

  async replan(
    pipelineId: string,
    operations: ReplanOperation[],
  ): Promise<{ success: boolean; nodeCount: number }> {
    const pipeline = await this.pipelineRepo.findById(pipelineId);
    if (!pipeline) {
      throw new NotFoundException(`Pipeline ${pipelineId} not found`);
    }
    if (pipeline.status !== PipelineStatus.Paused) {
      throw new BadRequestException('Replan is only allowed when pipeline is paused');
    }

    let nodes = [...(pipeline.nodes ?? [])];
    let edges = [...(pipeline.graph?.edges ?? [])];

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
        });
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

    await this.pipelineModel
      .updateOne(
        { pipelineId },
        {
          $set: {
            nodes,
            'graph.edges': edges,
            status: PipelineStatus.Running,
            pausedNodeId: null,
            pausedLaneId: null,
          },
        },
      )
      .exec();

    await this.resolver.enqueueReadyNodes(pipelineId);

    return { success: true, nodeCount: nodes.length };
  }
}
