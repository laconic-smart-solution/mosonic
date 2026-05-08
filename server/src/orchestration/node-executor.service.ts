import { Injectable, Logger } from '@nestjs/common';
import { EventsService } from '../events/events.service';
import { WorkflowNodeType } from '../nodes/schemas/workflow-node.schema';
import { ImageGenerationService } from '../nodes/services/image-generation.service';
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
    private readonly textGeneration: TextGenerationService,
    private readonly imageGeneration: ImageGenerationService,
    private readonly videoGeneration: VideoGenerationService,
    private readonly translation: TranslationService,
    private readonly transcription: TranscriptionService,
    private readonly summarization: SummarizationService,
  ) {}

  async execute(input: NodeExecutorInput): Promise<NodeExecutorOutput> {
    let attempt = 0;
    let lastError: unknown;

    while (attempt < NodeExecutor.MAX_ATTEMPTS) {
      attempt += 1;
      if (attempt > 1) {
        this.emitDual(input, 'node:retrying', {
          pipelineId: input.pipelineId,
          nodeId: input.node.nodeId,
          nodeType: input.node.type,
          attempt,
          maxAttempts: NodeExecutor.MAX_ATTEMPTS,
        });
      }
      try {
        return await this.executeNode(input);
      } catch (error) {
        lastError = error;
        this.logger.error(
          [
            `Node execution failed`,
            `pipelineId=${input.pipelineId}`,
            `nodeId=${input.node.nodeId}`,
            `nodeType=${input.node.type}`,
            `attempt=${attempt}/${NodeExecutor.MAX_ATTEMPTS}`,
            `details=${this.formatErrorDetails(error)}`,
          ].join(' | '),
        );
        if (attempt >= NodeExecutor.MAX_ATTEMPTS) {
          break;
        }
      }
    }

    this.emitDual(input, 'node:failed_final', {
      pipelineId: input.pipelineId,
      nodeId: input.node.nodeId,
      nodeType: input.node.type,
      message: this.getFriendlyError(lastError),
    });
    throw lastError instanceof Error
      ? lastError
      : new Error('Node execution failed');
  }

  private async executeNode(input: NodeExecutorInput): Promise<NodeExecutorOutput> {
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
      userPrompt: input.node.userPrompt,
      config: input.node.config,
      rule: input.context.rule,
      contentPrompt: input.context.contentPrompt,
      previousOutputs: input.context.previousOutputs,
      onChunk: (chunk) => {
        this.emitDual(input, 'node:streaming', {
          pipelineId: input.pipelineId,
          nodeId: input.node.nodeId,
          chunk,
        });
      },
    };

    const result = await this.executeNodeByType(input.node.type, nodeInput);
    const output = this.mapNodeOutput(input.node.type, result);

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
        nodeId: input.node.nodeId,
        nodeType: input.node.type,
        output,
      });
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
    this.events.emitToContent(input.contentId, event, {
      ...rest,
      contentId: input.contentId,
    });
  }

  private executeNodeByType(
    type: WorkflowNodeType,
    input: NodeExecutionInput,
  ): Promise<NodeExecutionResult> {
    switch (type) {
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
    }
    throw new Error(`Unsupported node type: ${type as string}`);
  }

  private mapNodeOutput(
    type: WorkflowNodeType,
    result: NodeExecutionResult,
  ): NodeExecutorOutput['output'] {
    switch (type) {
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
      default:
        return {};
    }
  }

  private getFriendlyError(error: unknown): string {
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
