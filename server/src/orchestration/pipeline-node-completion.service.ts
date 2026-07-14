import { Injectable, Inject, Logger } from '@nestjs/common';
import { EventsService } from '../events/events.service';
import { pipelineNodeReviewNotification } from '../events/notification.util';
import { WorkflowNodeType } from '../nodes/schemas/workflow-node.schema';
import type { IPipelineRepository } from '../pipeline/pipeline.repository';
import { PIPELINE_REPOSITORY } from '../pipeline/pipeline.repository';
import {
  PipelineNodeExecutionStatus,
  PipelineStatus,
} from '../pipeline/schemas/pipeline.schema';
import { parsePipelineNodeOutputString } from '../pipeline/pipeline-output-parse';
import { DependencyResolverService } from './dependency-resolver.service';
import { shouldPauseNodeForReview } from './pipeline-node-review-eligibility.util';

export type NodeSucceededContext = {
  pipelineId: string;
  nodeId: string;
  nodeType: WorkflowNodeType;
  order: number;
  totalNodes: number;
  lane?: string | null;
  output: Record<string, unknown>;
  userId?: string;
  ruleRef?: string;
};

@Injectable()
export class PipelineNodeCompletionService {
  private readonly logger = new Logger(PipelineNodeCompletionService.name);

  constructor(
    @Inject(PIPELINE_REPOSITORY)
    private readonly pipelineRepo: IPipelineRepository,
    private readonly resolver: DependencyResolverService,
    private readonly events: EventsService,
  ) {}

  async handleNodeSucceeded(ctx: NodeSucceededContext): Promise<void> {
    const pipeline = await this.pipelineRepo.findById(ctx.pipelineId);
    if (!pipeline) {
      this.logger.warn(
        `handleNodeSucceeded: pipeline ${ctx.pipelineId} not found`,
      );
      return;
    }
    if (
      pipeline.status === PipelineStatus.Completed ||
      pipeline.status === PipelineStatus.Failed
    ) {
      this.logger.warn(
        `handleNodeSucceeded: ignoring late success pipeline=${ctx.pipelineId} status=${pipeline.status}`,
      );
      return;
    }

    const existing = this.pipelineRepo.getNode(pipeline, ctx.nodeId);
    if (
      existing?.status === PipelineNodeExecutionStatus.Skipped ||
      existing?.status === PipelineNodeExecutionStatus.Completed
    ) {
      this.logger.warn(
        `handleNodeSucceeded: ignoring late success node=${ctx.nodeId} status=${existing.status}`,
      );
      return;
    }

    const shouldPauseForReview = shouldPauseNodeForReview(
      pipeline,
      ctx.nodeId,
      ctx.nodeType,
    );

    if (shouldPauseForReview) {
      await this.pipelineRepo.updateNodeStatus(
        ctx.pipelineId,
        ctx.nodeId,
        PipelineNodeExecutionStatus.WaitingReview,
        ctx.output,
      );

      this.events.emitToPipeline(ctx.pipelineId, 'node:waiting_review', {
        pipelineId: ctx.pipelineId,
        nodeId: ctx.nodeId,
        nodeType: ctx.nodeType,
        order: ctx.order,
        totalNodes: ctx.totalNodes,
        lane: ctx.lane ?? null,
        output: ctx.output,
      });

      if (pipeline.userId) {
        const body = pipelineNodeReviewNotification({
          pipelineId: ctx.pipelineId,
          nodeId: ctx.nodeId,
          nodeType: ctx.nodeType,
          ruleRef: ctx.ruleRef ?? pipeline.ruleRef,
          lane: ctx.lane ?? null,
        });
        this.events.emitUserNotification({
          userId: pipeline.userId,
          sector: 'pipeline',
          type: 'pipeline.step_review',
          ...body,
        });
      }

      this.logger.log(
        `[pipeline:${ctx.pipelineId}] node ${ctx.nodeId} waiting_review lane=${ctx.lane ?? 'trunk'}`,
      );
      return;
    }

    await this.pipelineRepo.updateNodeStatus(
      ctx.pipelineId,
      ctx.nodeId,
      PipelineNodeExecutionStatus.Completed,
      ctx.output,
    );

    this.events.emitToPipeline(ctx.pipelineId, 'node:completed', {
      pipelineId: ctx.pipelineId,
      nodeId: ctx.nodeId,
      nodeType: ctx.nodeType,
      order: ctx.order,
      totalNodes: ctx.totalNodes,
      output: ctx.output,
    });

    await this.resolver.onNodeCompleted(ctx.pipelineId, ctx.nodeId);
  }

  parseStoredOutput(output: string | null): Record<string, unknown> {
    return parsePipelineNodeOutputString(output) ?? {};
  }
}
