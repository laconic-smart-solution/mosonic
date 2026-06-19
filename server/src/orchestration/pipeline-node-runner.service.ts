import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import { buildIntelligenceContextFromPostMetrics } from '../analytics/intelligence-context.util';
import { PostAnalyticsService } from '../post/post-analytics.service';
import { PipelineBudgetExceededError } from '../cost/pipeline-budget-exceeded.error';
import { EventsService } from '../events/events.service';
import { WorkflowNodeType } from '../nodes/schemas/workflow-node.schema';
import type { WorkflowNodeConfig } from '../nodes/schemas/workflow-node.schema';
import type { NodeExecutorInput } from '../nodes/types/node-execution.types';
import type { IPipelineRepository } from '../pipeline/pipeline.repository';
import { PIPELINE_REPOSITORY } from '../pipeline/pipeline.repository';
import {
  PipelineNodeExecutionStatus,
  PipelineStatus,
} from '../pipeline/schemas/pipeline.schema';
import type { IRuleRepository } from '../repositories/interfaces/rule.repository.interface';
import { RULE_REPOSITORY } from '../repositories/tokens';
import { DependencyResolverService } from './dependency-resolver.service';
import { NodeExecutor } from './node-executor.service';
import { isSharedTrunkFailure } from './lane-pause.util';
import { resolveExecutionRule } from './pipeline-execution-rule.util';
import type { NodeJobPayload } from './types/node-job.payload';

@Injectable()
export class PipelineNodeRunnerService {
  private readonly logger = new Logger(PipelineNodeRunnerService.name);
  private readonly laneScopedPause: boolean;

  constructor(
    config: ConfigService,
    @Inject(PIPELINE_REPOSITORY)
    private readonly pipelineRepo: IPipelineRepository,
    private readonly nodeExecutor: NodeExecutor,
    private readonly resolver: DependencyResolverService,
    private readonly events: EventsService,
    @Inject(RULE_REPOSITORY)
    private readonly rules: IRuleRepository,
    private readonly postAnalyticsService: PostAnalyticsService,
  ) {
    this.laneScopedPause =
      config.get<string>('LANE_SCOPED_PAUSE', 'false').toLowerCase() === 'true';
  }

  async run(payload: NodeJobPayload): Promise<void> {
    const { pipelineId, nodeId, nodeType } = payload;
    this.logger.log(
      `[pipeline:${pipelineId}] run start ${nodeId} type=${nodeType} order=${payload.order}/${payload.totalNodes}`,
    );

    const pipeline = await this.pipelineRepo.findById(pipelineId);
    if (!pipeline) {
      const msg =
        `Pipeline ${pipelineId} not found in MongoDB — ` +
        'another worker may be consuming shared Redis while using a different database';
      this.logger.error(`[pipeline:${pipelineId}] ${msg}`);
      throw new UnrecoverableError(msg);
    }
    if (pipeline.status !== PipelineStatus.Running) {
      const msg = `Pipeline ${pipelineId} is not running (status=${pipeline.status})`;
      this.logger.warn(`[pipeline:${pipelineId}] run abort ${nodeId} — ${msg}`);
      throw new UnrecoverableError(msg);
    }

    const node = this.pipelineRepo.getNode(pipeline, payload.nodeId);
    if (!node) {
      const msg = `Node ${payload.nodeId} not found on pipeline ${pipelineId}`;
      this.logger.error(`[pipeline:${pipelineId}] ${msg}`);
      throw new UnrecoverableError(msg);
    }

    const rule = await this.rules.findById(payload.ruleId);
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
      const rows = await this.postAnalyticsService.aggregateMetricsForRule(
        payload.ruleId,
      );
      intelligenceContext = buildIntelligenceContextFromPostMetrics(
        rows.map((row) => ({
          channel: row.platform,
          contentRef: row.contentRef,
          metrics: row.metrics,
        })),
      );
    }

    const executorInput: NodeExecutorInput = {
      node: {
        nodeId: node.nodeId,
        type: node.type as unknown as WorkflowNodeType,
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
      this.logger.log(
        `[pipeline:${pipelineId}] run completed ${nodeId} type=${nodeType} — scheduling downstream`,
      );
      await this.resolver.onNodeCompleted(payload.pipelineId, payload.nodeId);
    } catch (err) {
      this.logger.error(
        `[pipeline:${pipelineId}] run failed ${nodeId} type=${nodeType}: ` +
          `${err instanceof Error ? err.message : String(err)}`,
      );
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
    this.logger.warn(
      `[pipeline:${pipelineId}] final failure ${nodeId} type=${nodeType}: ${error.message}`,
    );
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
