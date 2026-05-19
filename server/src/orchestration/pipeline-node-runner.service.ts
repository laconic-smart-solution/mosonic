import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AnalyticsRepository } from '../analytics/analytics.repository';
import { buildIntelligenceContextFromAnalytics } from '../analytics/intelligence-context.util';
import { PipelineBudgetExceededError } from '../cost/pipeline-budget-exceeded.error';
import { EventsService } from '../events/events.service';
import { WorkflowNodeType } from '../nodes/schemas/workflow-node.schema';
import type { WorkflowNodeConfig } from '../nodes/schemas/workflow-node.schema';
import type { NodeExecutorInput } from '../nodes/types/node-execution.types';
import { PipelineRepository } from '../pipeline/pipeline.repository';
import {
  PipelineNodeExecutionStatus,
  PipelineStatus,
} from '../pipeline/schemas/pipeline.schema';
import { Rule, type RuleDocument } from '../rule/schemas/rule.schema';
import { DependencyResolverService } from './dependency-resolver.service';
import { NodeExecutor } from './node-executor.service';
import { isSharedTrunkFailure } from './lane-pause.util';
import { resolveExecutionRule } from './pipeline-execution-rule.util';
import type { NodeJobPayload } from './types/node-job.payload';

@Injectable()
export class PipelineNodeRunnerService {
  private readonly laneScopedPause: boolean;

  constructor(
    config: ConfigService,
    private readonly pipelineRepo: PipelineRepository,
    private readonly nodeExecutor: NodeExecutor,
    private readonly resolver: DependencyResolverService,
    private readonly events: EventsService,
    @InjectModel(Rule.name)
    private readonly ruleModel: Model<RuleDocument>,
    private readonly analyticsRepo: AnalyticsRepository,
  ) {
    this.laneScopedPause =
      config.get<string>('LANE_SCOPED_PAUSE', 'false').toLowerCase() === 'true';
  }

  async run(payload: NodeJobPayload): Promise<void> {
    const pipeline = await this.pipelineRepo.findById(payload.pipelineId);
    if (!pipeline) {
      return;
    }
    if (pipeline.status !== PipelineStatus.Running) {
      return;
    }

    const node = this.pipelineRepo.getNode(pipeline, payload.nodeId);
    if (!node) {
      return;
    }

    const rule = await this.ruleModel.findOne({ ruleId: payload.ruleId }).exec();
    if (!rule) {
      throw new Error(`Rule ${payload.ruleId} not found`);
    }

    await this.pipelineRepo.updateNodeStatus(
      payload.pipelineId,
      payload.nodeId,
      PipelineNodeExecutionStatus.Running,
    );

    const edges = this.pipelineRepo.getEdgesForPipeline(pipeline);
    const previousOutputs = this.pipelineRepo.buildAncestorOutputs(
      pipeline,
      payload.nodeId,
      edges,
    );

    const executionRule = resolveExecutionRule(pipeline, rule);
    let intelligenceContext;
    if (node.type === WorkflowNodeType.Intelligence) {
      const analytics = await this.analyticsRepo.findByRuleRef(payload.ruleId);
      intelligenceContext = buildIntelligenceContextFromAnalytics(analytics);
    }

    const executorInput: NodeExecutorInput = {
      node: {
        nodeId: node.nodeId,
        type: node.type,
        order: node.order,
        config: (node.config ?? {}) as WorkflowNodeConfig,
        workflowRef: payload.workflowId,
      },
      context: {
        rule: executionRule,
        contentPrompt: payload.contentPrompt,
        previousOutputs,
      },
      pipelineId: payload.pipelineId,
      totalNodes: payload.totalNodes,
      userId: payload.userId,
      ruleId: payload.ruleId,
      maxAttempts: 1,
      suppressFailedFinalEmit: true,
      intelligenceContext,
    };

    try {
      const result = await this.nodeExecutor.execute(executorInput);
      await this.pipelineRepo.updateNodeStatus(
        payload.pipelineId,
        payload.nodeId,
        PipelineNodeExecutionStatus.Completed,
        result.output,
      );
      await this.resolver.onNodeCompleted(payload.pipelineId, payload.nodeId);
    } catch (err) {
      if (err instanceof PipelineBudgetExceededError) {
        await this.pipelineRepo.updateNodeStatus(
          payload.pipelineId,
          payload.nodeId,
          PipelineNodeExecutionStatus.Failed,
        );
        await this.pipelineRepo.setPipelineStatus(
          payload.pipelineId,
          PipelineStatus.Failed,
          {
            completedAt: new Date(),
            pausedNodeId: null,
          },
        );
        this.events.emitToPipeline(payload.pipelineId, 'pipeline:failed', {
          pipelineId: payload.pipelineId,
          message: err.message,
          reason: 'budget',
          scope: err.scope,
        });
        throw err;
      }
      throw err;
    }
  }

  async handleFinalFailure(
    payload: NodeJobPayload,
    error: Error,
  ): Promise<void> {
    const { pipelineId, nodeId, nodeType } = payload;
    const pipeline = await this.pipelineRepo.findById(pipelineId);
    if (!pipeline) {
      return;
    }

    await this.pipelineRepo.updateNodeStatus(
      pipelineId,
      nodeId,
      PipelineNodeExecutionStatus.Failed,
    );
    const failedNode = this.pipelineRepo.getNode(pipeline, nodeId);
    const laneId = failedNode?.lane ?? null;
    const laneScopedContinue =
      this.laneScopedPause &&
      laneId &&
      !isSharedTrunkFailure(pipeline, nodeId);

    if (laneScopedContinue) {
      await this.pipelineRepo.setPipelineStatus(
        pipelineId,
        PipelineStatus.Running,
        {
          pausedNodeId: nodeId,
          pausedLaneId: laneId,
        },
      );
    } else {
      await this.pipelineRepo.setPipelineStatus(pipelineId, PipelineStatus.Paused, {
        pausedNodeId: nodeId,
        pausedLaneId: laneId,
      });
    }

    this.events.emitToPipeline(pipelineId, 'node:failed_final', {
      pipelineId,
      nodeId,
      nodeType,
      message: this.nodeExecutor.getFriendlyError(error),
    });
    if (!laneScopedContinue) {
      this.events.emitToPipeline(pipelineId, 'pipeline:paused', {
        pipelineId,
        nodeId,
        nodeType,
        pausedLaneId: laneId,
      });
    } else {
      this.events.emitToPipeline(pipelineId, 'pipeline:lane_paused', {
        pipelineId,
        nodeId,
        nodeType,
        pausedLaneId: laneId,
      });
      await this.resolver.enqueueReadyNodes(pipelineId);
    }
  }
}
