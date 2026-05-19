import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { PreviousOutputs } from '../nodes/types/node-execution.types';
import {
  buildLinearEdgesFromOrder,
  getAncestorsForLane,
  topologicalSort,
  type WorkflowGraphEdge,
} from '../workflow/workflow-graph.util';
import { mergeParsedIntoPreviousOutputs } from './pipeline-output-merge.util';
import { parsePipelineNodeOutputString } from './pipeline-output-parse';
import {
  Pipeline,
  PipelineNodeExecutionStatus,
  PipelineStatus,
  type PipelineDocument,
} from './schemas/pipeline.schema';

@Injectable()
export class PipelineRepository {
  constructor(
    @InjectModel(Pipeline.name)
    private readonly pipelineModel: Model<PipelineDocument>,
  ) {}

  findById(pipelineId: string): Promise<PipelineDocument | null> {
    return this.pipelineModel.findOne({ pipelineId }).exec();
  }

  getEdgesForPipeline(pipeline: PipelineDocument): WorkflowGraphEdge[] {
    const stored = pipeline.graph?.edges ?? [];
    if (stored.length > 0) {
      return stored.map((e) => ({ from: e.from, to: e.to }));
    }
    return buildLinearEdgesFromOrder(
      (pipeline.nodes ?? []).map((n) => ({
        nodeId: n.nodeId,
        order: n.order,
      })),
    );
  }

  async updateNodeStatus(
    pipelineId: string,
    nodeId: string,
    status: PipelineNodeExecutionStatus,
    output?: Record<string, unknown>,
  ): Promise<void> {
    await this.pipelineModel
      .updateOne(
        { pipelineId, 'nodes.nodeId': nodeId },
        {
          $set: {
            'nodes.$.status': status,
            ...(output !== undefined
              ? { 'nodes.$.output': JSON.stringify(output) }
              : {}),
            'nodes.$.executedAt': new Date(),
          },
          ...(status === PipelineNodeExecutionStatus.Failed
            ? { $inc: { 'nodes.$.retryCount': 1 } }
            : {}),
        },
      )
      .exec();
  }

  async saveExternalJobId(
    pipelineId: string,
    nodeId: string,
    externalJobId: string,
  ): Promise<void> {
    await this.pipelineModel
      .updateOne(
        { pipelineId, 'nodes.nodeId': nodeId },
        { $set: { 'nodes.$.externalJobId': externalJobId } },
      )
      .exec();
  }

  async clearExternalJobId(pipelineId: string, nodeId: string): Promise<void> {
    await this.pipelineModel
      .updateOne(
        { pipelineId, 'nodes.nodeId': nodeId },
        { $set: { 'nodes.$.externalJobId': null } },
      )
      .exec();
  }

  async markNodeSkipped(pipelineId: string, nodeId: string): Promise<void> {
    await this.pipelineModel
      .updateOne(
        { pipelineId, 'nodes.nodeId': nodeId },
        {
          $set: {
            'nodes.$.status': PipelineNodeExecutionStatus.Skipped,
            'nodes.$.executedAt': new Date(),
          },
        },
      )
      .exec();
  }

  async resetNodeToPending(pipelineId: string, nodeId: string): Promise<void> {
    await this.pipelineModel
      .updateOne(
        { pipelineId, 'nodes.nodeId': nodeId },
        {
          $set: {
            'nodes.$.status': PipelineNodeExecutionStatus.Pending,
          },
        },
      )
      .exec();
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
    const $set: Record<string, unknown> = { status };
    if (options?.completedAt) {
      $set.completedAt = options.completedAt;
    }
    if (options && 'pausedNodeId' in options) {
      $set.pausedNodeId = options.pausedNodeId;
    }
    if (options && 'pausedLaneId' in options) {
      $set.pausedLaneId = options.pausedLaneId;
    }
    await this.pipelineModel.updateOne({ pipelineId }, { $set }).exec();
  }

  getNode(
    pipeline: PipelineDocument,
    nodeId: string,
  ): PipelineDocument['nodes'][number] | undefined {
    return pipeline.nodes?.find((n) => n.nodeId === nodeId);
  }

  buildPreviousOutputsUpToOrder(
    pipeline: PipelineDocument,
    upToOrder: number,
  ): PreviousOutputs {
    const previousOutputs: PreviousOutputs = {};
    const sorted = [...(pipeline.nodes ?? [])].sort((a, b) => a.order - b.order);
    for (const node of sorted) {
      if (node.order >= upToOrder) {
        break;
      }
      if (
        node.status !== PipelineNodeExecutionStatus.Completed &&
        node.status !== PipelineNodeExecutionStatus.Skipped
      ) {
        continue;
      }
      const parsed = parsePipelineNodeOutputString(node.output);
      if (parsed) {
        mergeParsedIntoPreviousOutputs(previousOutputs, parsed);
      }
    }
    return previousOutputs;
  }

  buildAncestorOutputs(
    pipeline: PipelineDocument,
    nodeId: string,
    edges?: WorkflowGraphEdge[],
  ): PreviousOutputs {
    const graphEdges = edges ?? this.getEdgesForPipeline(pipeline);
    const target = this.getNode(pipeline, nodeId);
    const nodesById = new Map(
      (pipeline.nodes ?? []).map((n) => [
        n.nodeId,
        { nodeId: n.nodeId, lane: n.lane ?? null },
      ]),
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
      if (!node) {
        continue;
      }
      if (
        node.status !== PipelineNodeExecutionStatus.Completed &&
        node.status !== PipelineNodeExecutionStatus.Skipped
      ) {
        continue;
      }
      const parsed = parsePipelineNodeOutputString(node.output);
      if (parsed) {
        mergeParsedIntoPreviousOutputs(previousOutputs, parsed);
      }
    }
    return previousOutputs;
  }

  allNodesTerminal(pipeline: PipelineDocument): boolean {
    return (pipeline.nodes ?? []).every(
      (n) =>
        n.status === PipelineNodeExecutionStatus.Completed ||
        n.status === PipelineNodeExecutionStatus.Skipped,
    );
  }
}
