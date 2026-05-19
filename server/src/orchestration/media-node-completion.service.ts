import { Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CostService } from '../cost/cost.service';
import { RecordCostDto } from '../cost/dto/record-cost.dto';
import { PipelineBudgetExceededError } from '../cost/pipeline-budget-exceeded.error';
import { EventsService } from '../events/events.service';
import {
  LlmProvider,
  WorkflowNodeType,
  type WorkflowNodeConfig,
} from '../nodes/schemas/workflow-node.schema';
import type { VideoGenerationInput } from '../nodes/types/node-execution.types';
import type { VideoCompleteResult } from '../nodes/services/video-generation.service';
import { PipelineRepository } from '../pipeline/pipeline.repository';
import {
  PipelineNodeExecutionStatus,
} from '../pipeline/schemas/pipeline.schema';
import { Rule, type RuleDocument } from '../rule/schemas/rule.schema';
import { DependencyResolverService } from './dependency-resolver.service';
import { PipelineNodeRunnerService } from './pipeline-node-runner.service';
import { resolveExecutionRule } from './pipeline-execution-rule.util';
import type { NodeJobPayload } from './types/node-job.payload';

@Injectable()
export class MediaNodeCompletionService {
  private readonly logger = new Logger(MediaNodeCompletionService.name);

  constructor(
    private readonly pipelineRepo: PipelineRepository,
    private readonly resolver: DependencyResolverService,
    private readonly pipelineNodeRunner: PipelineNodeRunnerService,
    private readonly events: EventsService,
    private readonly costService: CostService,
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

  async failVideoNode(payload: NodeJobPayload, error: Error): Promise<void> {
    await this.pipelineRepo.clearExternalJobId(
      payload.pipelineId,
      payload.nodeId,
    );
    await this.pipelineNodeRunner.handleFinalFailure(payload, error);
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
