import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CostService } from '../cost/cost.service';
import { RecordCostDto } from '../cost/dto/record-cost.dto';
import { PipelineBudgetExceededError } from '../cost/pipeline-budget-exceeded.error';
import { EventsService } from '../events/events.service';
import { LoggingService } from '../logging/logging.service';
import {
  LogLevel,
  PipelineLogStatus,
} from '../logging/schemas/pipeline-log.schema';
import {
  LlmProvider,
  WorkflowNodeType,
  type WorkflowNodeConfig,
} from '../nodes/schemas/workflow-node.schema';
import type { VideoGenerationInput } from '../nodes/types/node-execution.types';
import type {
  VideoCompleteResult,
  VideoJobProvider,
} from '../nodes/services/video-generation.service';
import { getVideoGenerationMode } from '../nodes/services/video-generation.service';
import { PipelineRepository } from '../pipeline/pipeline.repository';
import {
  PipelineNodeExecutionStatus,
} from '../pipeline/schemas/pipeline.schema';
import { Rule, type RuleDocument } from '../rule/schemas/rule.schema';
import { DependencyResolverService } from './dependency-resolver.service';
import { PipelineNodeRunnerService } from './pipeline-node-runner.service';
import { resolveExecutionRule } from './pipeline-execution-rule.util';
import type { NodeJobPayload } from './types/node-job.payload';

const PIPELINE_LOG_RETENTION_DAYS = 90;

export type VideoFailureContext = {
  videoProvider?: VideoJobProvider;
  stage?: 'submit' | 'poll' | 'complete' | 'webhook' | 'timeout';
};

@Injectable()
export class MediaNodeCompletionService {
  private readonly logger = new Logger(MediaNodeCompletionService.name);

  constructor(
    private readonly pipelineRepo: PipelineRepository,
    private readonly resolver: DependencyResolverService,
    private readonly pipelineNodeRunner: PipelineNodeRunnerService,
    private readonly events: EventsService,
    private readonly costService: CostService,
    private readonly loggingService: LoggingService,
    @InjectModel(Rule.name)
    private readonly ruleModel: Model<RuleDocument>,
  ) {}

  async buildVideoGenerationInput(
    payload: NodeJobPayload,
  ): Promise<VideoGenerationInput & { pipelineId: string; nodeId: string }> {
    const pipeline = await this.pipelineRepo.findById(payload.pipelineId);
    if (!pipeline) {
      throw new UnprocessableEntityException(
        `Pipeline ${payload.pipelineId} not found`,
      );
    }
    const node = this.pipelineRepo.getNode(pipeline, payload.nodeId);
    if (!node) {
      throw new UnprocessableEntityException(
        `Node ${payload.nodeId} not found on pipeline ${payload.pipelineId}`,
      );
    }
    const rule = await this.ruleModel.findOne({ ruleId: payload.ruleId }).exec();
    if (!rule) {
      throw new UnprocessableEntityException(`Rule ${payload.ruleId} not found`);
    }

    const edges = this.pipelineRepo.getEdgesForPipeline(pipeline);
    const previousOutputs = this.pipelineRepo.buildAncestorOutputs(
      pipeline,
      payload.nodeId,
      edges,
    );
    const executionRule = resolveExecutionRule(pipeline, rule);

    return {
      rule: executionRule,
      contentPrompt: payload.contentPrompt,
      previousOutputs,
      config: (node.config ?? {}) as WorkflowNodeConfig,
      pipelineId: payload.pipelineId,
      nodeId: payload.nodeId,
    };
  }

  async completeVideoNode(
    payload: NodeJobPayload,
    result: VideoCompleteResult,
  ): Promise<void> {
    await this.pipelineRepo.updateNodeStatus(
      payload.pipelineId,
      payload.nodeId,
      PipelineNodeExecutionStatus.Completed,
      { video: result.video },
    );
    await this.pipelineRepo.clearExternalJobId(
      payload.pipelineId,
      payload.nodeId,
    );

    await this.recordVideoCost(payload, result);

    const pipeline = await this.pipelineRepo.findById(payload.pipelineId);
    const node = pipeline
      ? this.pipelineRepo.getNode(pipeline, payload.nodeId)
      : undefined;

    this.events.emitToPipeline(payload.pipelineId, 'node:completed', {
      pipelineId: payload.pipelineId,
      nodeId: payload.nodeId,
      nodeType: payload.nodeType,
      order: payload.order,
      totalNodes: payload.totalNodes,
      output: { video: result.video },
    });

    await this.resolver.onNodeCompleted(payload.pipelineId, payload.nodeId);
    await this.resolver.maybeFinalize(payload.pipelineId);

    this.logger.log(
      `Video node completed pipeline=${payload.pipelineId} node=${payload.nodeId} lane=${node?.lane ?? 'trunk'}`,
    );
  }

  async failVideoNode(
    payload: NodeJobPayload,
    error: Error,
    context?: VideoFailureContext,
  ): Promise<void> {
    const pipeline = await this.pipelineRepo.findById(payload.pipelineId);
    const node = pipeline
      ? this.pipelineRepo.getNode(pipeline, payload.nodeId)
      : undefined;
    const nodeConfig = (node?.config ?? {}) as WorkflowNodeConfig;
    const mode = getVideoGenerationMode(nodeConfig);
    const videoProvider =
      context?.videoProvider ??
      (mode === 'presenter' ? 'heygen' : 'sora');

    const logMessage = this.formatVideoFailureMessage(error, videoProvider);
    const errorDetail = {
      pipelineId: payload.pipelineId,
      workflowId: payload.workflowId,
      ruleId: payload.ruleId,
      nodeId: payload.nodeId,
      lane: payload.lane ?? node?.lane ?? null,
      stage: context?.stage ?? 'unknown',
      mode,
      videoProvider,
      externalJobId: node?.externalJobId ?? null,
      message: error.message,
    };

    this.logger.error(
      `[video:failed] ${logMessage} | ${JSON.stringify(errorDetail)}`,
      error.stack,
    );

    await this.pipelineRepo.setNodeLastError(
      payload.pipelineId,
      payload.nodeId,
      logMessage,
    );

    try {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + PIPELINE_LOG_RETENTION_DAYS);
      const doc = await this.loggingService.appendLog({
        pipelineRef: payload.pipelineId,
        workflowRef: payload.workflowId,
        nodeId: payload.nodeId,
        nodeType: WorkflowNodeType.VideoGeneration,
        order: payload.order,
        level: LogLevel.Error,
        status: PipelineLogStatus.Failed,
        message: logMessage,
        retryCount: node?.retryCount ?? 0,
        expiresAt,
      });
      this.events.emitToPipeline(payload.pipelineId, 'pipeline:log', {
        pipelineId: payload.pipelineId,
        log: {
          logId: doc.logId,
          pipelineRef: doc.pipelineRef,
          nodeId: doc.nodeId,
          nodeType: doc.nodeType,
          order: doc.order,
          level: doc.level,
          status: doc.status,
          message: doc.message,
          retryCount: doc.retryCount,
          timestamp: doc.timestamp,
        },
      });
    } catch (logErr) {
      this.logger.warn(
        `Failed to persist video error log pipeline=${payload.pipelineId}: ${
          logErr instanceof Error ? logErr.message : String(logErr)
        }`,
      );
    }

    await this.pipelineRepo.clearExternalJobId(
      payload.pipelineId,
      payload.nodeId,
    );
    await this.pipelineNodeRunner.handleFinalFailure(payload, error);
  }

  private formatVideoFailureMessage(
    error: Error,
    videoProvider: VideoJobProvider,
  ): string {
    const label =
      videoProvider === 'heygen' ? 'Presenter video' : 'Cinematic video';
    const raw = error.message?.trim();
    if (!raw) {
      return `${label} generation failed. Please retry or skip.`;
    }
    if (raw.length <= 240) {
      return `${label} — ${raw}`;
    }
    return `${label} — ${raw.slice(0, 237)}…`;
  }

  private async recordVideoCost(
    payload: NodeJobPayload,
    result: VideoCompleteResult,
  ): Promise<void> {
    if (!payload.userId) {
      return;
    }
    const vc = result.videoCost;
    const dto: RecordCostDto = {
      userId: payload.userId,
      pipelineRef: payload.pipelineId,
      campaignRef: payload.ruleId,
      nodeId: payload.nodeId,
      nodeType: WorkflowNodeType.VideoGeneration,
      provider: LlmProvider.OpenAI,
      providerModel: vc.model,
      entryType: 'openai_video',
      videoSeconds: vc.videoSeconds,
      videoResolution: vc.videoResolution,
    };
    try {
      await this.costService.recordNodeCost(dto);
    } catch (e) {
      if (e instanceof PipelineBudgetExceededError) {
        throw e;
      }
      this.logger.warn(
        `Cost recording failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}
