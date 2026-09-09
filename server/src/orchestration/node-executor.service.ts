import { Injectable, Logger } from '@nestjs/common';
import { CostService } from '../cost/cost.service';
import { RecordCostDto } from '../cost/dto/record-cost.dto';
import { PipelineBudgetExceededError } from '../cost/pipeline-budget-exceeded.error';
import { EventsService } from '../events/events.service';
import {
  LlmProvider,
  WorkflowNodeType,
  type WorkflowNodeConfig,
} from '../nodes/schemas/workflow-node.schema';
import { ImageGenerationService } from '../nodes/services/image-generation.service';
import { KeywordPlannerService } from '../nodes/services/keyword-planner.service';
import { AdaptNodeService } from '../nodes/services/adapt-node.service';
import { IntelligenceNodeService } from '../nodes/services/intelligence-node.service';
import { MergeBarrierService } from '../nodes/services/merge-barrier.service';
import { SummarizationService } from '../nodes/services/summarization.service';
import { TextGenerationService } from '../nodes/services/text-generation.service';
import { TranscriptionService } from '../nodes/services/transcription.service';
import { TranslationService } from '../nodes/services/translation.service';
import { VideoGenerationService } from '../nodes/services/video-generation.service';
import type {
  NodeExecutorInput,
  NodeExecutorOutput,
  NodeExecutionInput,
  NodeExecutionResult,
} from '../nodes/types/node-execution.types';

/**
 * Dispatches orchestration node execution to the correct pipeline AI service.
 */
@Injectable()
export class NodeExecutor {
  private static readonly MAX_ATTEMPTS = 3;
  private readonly logger = new Logger(NodeExecutor.name);

  constructor(
    private readonly events: EventsService,
    private readonly keywordPlanner: KeywordPlannerService,
    private readonly textGeneration: TextGenerationService,
    private readonly imageGeneration: ImageGenerationService,
    private readonly videoGeneration: VideoGenerationService,
    private readonly translation: TranslationService,
    private readonly transcription: TranscriptionService,
    private readonly summarization: SummarizationService,
    private readonly adaptNode: AdaptNodeService,
    private readonly intelligenceNode: IntelligenceNodeService,
    private readonly mergeBarrier: MergeBarrierService,
    private readonly costService: CostService,
  ) {}

  getFriendlyError(error: unknown): string {
    return this.getFriendlyErrorMessage(error);
  }

  async execute(input: NodeExecutorInput): Promise<NodeExecutorOutput> {
    const maxAttempts = input.maxAttempts ?? NodeExecutor.MAX_ATTEMPTS;
    let attempt = 0;
    let lastError: unknown;

    while (attempt < maxAttempts) {
      attempt += 1;
      if (attempt > 1) {
        this.emitDual(input, 'node:retrying', {
          pipelineId: input.pipelineId,
          nodeId: input.node.nodeId,
          nodeType: input.node.type,
          attempt,
          maxAttempts,
        });
      }
      try {
        return await this.executeNode(input);
      } catch (error) {
        if (error instanceof PipelineBudgetExceededError) {
          throw error;
        }
        lastError = error;
        this.logger.error(
          [
            `Node execution failed`,
            `pipelineId=${input.pipelineId}`,
            `nodeId=${input.node.nodeId}`,
            `nodeType=${input.node.type}`,
            `attempt=${attempt}/${maxAttempts}`,
            `details=${this.formatErrorDetails(error)}`,
          ].join(' | '),
        );
        if (attempt >= maxAttempts) {
          break;
        }
      }
    }

    if (!input.suppressFailedFinalEmit) {
      this.emitDual(input, 'node:failed_final', {
        pipelineId: input.pipelineId,
        nodeId: input.node.nodeId,
        nodeType: input.node.type,
        message: this.getFriendlyErrorMessage(lastError),
      });
    }
    throw lastError instanceof Error
      ? lastError
      : new Error('Node execution failed');
  }

  private async executeNode(
    input: NodeExecutorInput,
  ): Promise<NodeExecutorOutput> {
    this.emitDual(input, 'node:started', {
      pipelineId: input.pipelineId,
      nodeId: input.node.nodeId,
      nodeType: input.node.type,
      order: input.node.order,
      totalNodes: input.totalNodes,
    });

    const nodeInput: NodeExecutionInput = {
      pipelineRef: input.pipelineId,
      workflowRef: input.node.workflowRef ?? input.pipelineId,
      nodeId: input.node.nodeId,
      order: input.node.order,
      config: input.node.config,
      rule: input.context.rule,
      contentPrompt: input.context.contentPrompt,
      previousOutputs: input.context.previousOutputs,
      intelligenceContext: input.intelligenceContext,
      nodeUserPrompt: input.node.userPrompt?.trim() || undefined,
      onChunk: (chunk) => {
        this.emitDual(input, 'node:streaming', {
          pipelineId: input.pipelineId,
          nodeId: input.node.nodeId,
          chunk,
        });
      },
    };

    const result = await this.executeNodeByType(input.node.type, nodeInput);
    await this.recordNodeCostIfApplicable(input, result);
    const output = this.mapNodeOutput(input.node.type, result);

    if (!input.suppressCompletedEmit) {
      this.events.emitToPipeline(input.pipelineId, 'node:completed', {
        pipelineId: input.pipelineId,
        nodeId: input.node.nodeId,
        nodeType: input.node.type,
        order: input.node.order,
        totalNodes: input.totalNodes,
        output,
      });
      if (input.contentId) {
        this.events.emitToContent(input.contentId, 'node:rerun_completed', {
          contentId: input.contentId,
          nodeId: input.contentOutputNodeId ?? input.node.nodeId,
          nodeType: input.node.type,
          output,
        });
      }
    }

    return { nodeId: input.node.nodeId, type: input.node.type, output };
  }

  private emitDual(
    input: NodeExecutorInput,
    event: string,
    pipelinePayload: Record<string, unknown>,
  ): void {
    this.events.emitToPipeline(input.pipelineId, event, pipelinePayload);
    if (!input.contentId) return;
    const { pipelineId: _drop, ...rest } = pipelinePayload;
    const contentPayload: Record<string, unknown> = {
      ...rest,
      contentId: input.contentId,
    };
    if (
      input.contentOutputNodeId &&
      typeof contentPayload.nodeId === 'string'
    ) {
      contentPayload.nodeId = input.contentOutputNodeId;
    }
    this.events.emitToContent(input.contentId, event, contentPayload);
  }

  private executeNodeByType(
    type: WorkflowNodeType,
    input: NodeExecutionInput,
  ): Promise<NodeExecutionResult> {
    switch (type) {
      case WorkflowNodeType.KeywordPlanner:
        return this.keywordPlanner.execute(input);
      case WorkflowNodeType.TextGeneration:
        return this.textGeneration.execute(input);
      case WorkflowNodeType.ImageGeneration:
        return this.imageGeneration.execute(input);
      case WorkflowNodeType.VideoGeneration:
        return this.videoGeneration.execute(input);
      case WorkflowNodeType.Translation:
        return this.translation.execute(input);
      case WorkflowNodeType.Transcription:
        return this.transcription.execute(input);
      case WorkflowNodeType.Summarization:
        return this.summarization.execute(input);
      case WorkflowNodeType.Adapt:
        return this.adaptNode.execute(input);
      case WorkflowNodeType.Intelligence:
        return this.intelligenceNode.execute(input);
      case WorkflowNodeType.Merge:
        return this.mergeBarrier.execute(input);
      case WorkflowNodeType.Branch:
        throw new Error('branch nodes are expanded before execution');
    }
    throw new Error(`Unsupported node type: ${type as string}`);
  }

  private mapNodeOutput(
    type: WorkflowNodeType,
    result: NodeExecutionResult,
  ): NodeExecutorOutput['output'] {
    switch (type) {
      case WorkflowNodeType.KeywordPlanner:
        return { keywords: result.output ?? undefined };
      case WorkflowNodeType.TextGeneration:
        return { text: result.output ?? undefined };
      case WorkflowNodeType.ImageGeneration:
        return { image: result.output ?? undefined };
      case WorkflowNodeType.Translation:
        return { translatedText: result.output ?? undefined };
      case WorkflowNodeType.Summarization:
        return { summary: result.output ?? undefined };
      case WorkflowNodeType.Transcription:
        return { transcription: result.output ?? undefined };
      case WorkflowNodeType.VideoGeneration:
        return { video: result.output ?? undefined };
      case WorkflowNodeType.Adapt:
      case WorkflowNodeType.Intelligence:
      case WorkflowNodeType.Merge:
        return this.parseStructuredNodeOutput(result.output);
      default:
        return {};
    }
  }

  private parseStructuredNodeOutput(
    raw: string | null,
  ): NodeExecutorOutput['output'] {
    if (!raw?.trim()) {
      return {};
    }
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const out: NodeExecutorOutput['output'] = {};
      const stringKeys = [
        'keywords',
        'text',
        'image',
        'translatedText',
        'summary',
        'transcription',
        'video',
        'intelligenceHints',
        'intelligenceBrief',
        'adaptedCaption',
        'channel',
      ] as const;
      for (const key of stringKeys) {
        const val = parsed[key];
        if (typeof val === 'string' && val.trim()) {
          out[key] = val;
        }
      }
      if (parsed.merged === true) {
        out.merged = true;
      }
      return out;
    } catch {
      return { text: raw };
    }
  }

  private async recordNodeCostIfApplicable(
    input: NodeExecutorInput,
    result: NodeExecutionResult,
  ): Promise<void> {
    const dto = this.buildRecordCostDto(input, result);
    if (!dto) {
      return;
    }
    try {
      // Credits are charged up-front at pipeline start and reconciled on
      // completion; only record raw cost here for analytics/budget tracking.
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

  private buildRecordCostDto(
    input: NodeExecutorInput,
    result: NodeExecutionResult,
  ): RecordCostDto | null {
    if (!input.userId || !input.ruleId) {
      return null;
    }
    const cfg = input.node.config ?? {};
    const provider = this.providerFromConfig(cfg);
    const base: Pick<
      RecordCostDto,
      | 'userId'
      | 'pipelineRef'
      | 'campaignRef'
      | 'contentRef'
      | 'nodeId'
      | 'nodeType'
      | 'provider'
    > = {
      userId: input.userId,
      pipelineRef: input.pipelineId,
      campaignRef: input.ruleId,
      contentRef: input.contentId,
      nodeId: input.node.nodeId,
      nodeType: input.node.type,
      provider,
    };

    switch (input.node.type) {
      case WorkflowNodeType.KeywordPlanner:
      case WorkflowNodeType.TextGeneration:
      case WorkflowNodeType.Translation:
      case WorkflowNodeType.Summarization:
      case WorkflowNodeType.Intelligence: {
        const model =
          typeof cfg.model === 'string' && cfg.model.trim()
            ? cfg.model.trim()
            : 'gpt-4o';
        return {
          ...base,
          providerModel: model,
          entryType: 'openai_llm',
          inputTokens: result.usage?.inputTokens,
          outputTokens: result.usage?.outputTokens,
        };
      }
      case WorkflowNodeType.ImageGeneration: {
        const ic = result.imageCost;
        if (!ic) {
          return null;
        }
        return {
          ...base,
          providerModel: ic.model,
          entryType: 'openai_image',
          imageCount: ic.count,
          imageSize: ic.size,
          imageQuality: ic.quality,
        };
      }
      case WorkflowNodeType.VideoGeneration: {
        const vc = result.videoCost;
        if (!vc) {
          return null;
        }
        return {
          ...base,
          providerModel: vc.model,
          entryType: 'openai_video',
          videoSeconds: vc.videoSeconds,
          videoResolution: vc.videoResolution,
        };
      }
      case WorkflowNodeType.Transcription: {
        const model =
          typeof cfg.model === 'string' && cfg.model.trim()
            ? cfg.model.trim()
            : 'whisper-1';
        return {
          ...base,
          providerModel: model,
          entryType: 'openai_llm',
          audioDurationSeconds: result.audioDurationSeconds,
        };
      }
      case WorkflowNodeType.Adapt: {
        const model =
          typeof cfg.model === 'string' && cfg.model.trim()
            ? cfg.model.trim()
            : 'gpt-4o';
        return {
          ...base,
          providerModel: model,
          entryType: 'openai_llm',
          inputTokens: result.usage?.inputTokens,
          outputTokens: result.usage?.outputTokens,
        };
      }
      default:
        return null;
    }
  }

  private providerFromConfig(cfg: WorkflowNodeConfig): string {
    const p = cfg.provider;
    if (p && (Object.values(LlmProvider) as string[]).includes(p)) {
      return p;
    }
    return LlmProvider.OpenAI;
  }

  private getFriendlyErrorMessage(error: unknown): string {
    const raw = error instanceof Error ? error.message : String(error ?? '');
    const message = raw.toLowerCase();
    if (message.includes('rate limit')) {
      return 'Service is busy. Please retry in a moment.';
    }
    if (message.includes('timeout')) {
      return 'Request timed out. Please retry.';
    }
    if (message.includes('connect') || message.includes('network')) {
      return 'Could not connect to generation service. Please retry.';
    }
    if (message.includes('content policy')) {
      return 'Content was rejected by generation service. Please adjust your prompt and retry.';
    }
    return 'Generation failed. Please retry.';
  }

  private formatErrorDetails(error: unknown): string {
    if (error instanceof Error) {
      const maybe = error as Error & {
        status?: number;
        code?: string;
        type?: string;
      };
      return JSON.stringify({
        name: maybe.name,
        message: maybe.message,
        status: maybe.status,
        code: maybe.code,
        type: maybe.type,
      });
    }
    return String(error ?? 'unknown');
  }
}
