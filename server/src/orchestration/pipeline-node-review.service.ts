import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { TenancyAuth } from '../auth/tenancy.types';
import { WorkflowNodeType } from '../nodes/schemas/workflow-node.schema';
import type { IPipelineRepository } from '../pipeline/pipeline.repository';
import { PIPELINE_REPOSITORY } from '../pipeline/pipeline.repository';
import { PipelineNodeExecutionStatus } from '../pipeline/schemas/pipeline.schema';
import { parsePipelineNodeOutputString } from '../pipeline/pipeline-output-parse';
import { parsePipelineNodes } from '../repositories/prisma/pipeline-nodes.util';
import { DependencyResolverService } from './dependency-resolver.service';
import {
  buildEditedOutput,
  isMediaReviewNode,
  isTextReviewNode,
} from './pipeline-node-review.util';

export type NodeReviewAction = 'continue' | 'edit' | 'regenerate';

export type NodeReviewInput = {
  pipelineId: string;
  nodeId: string;
  action: NodeReviewAction;
  editedContent?: string;
  regenerateInstruction?: string;
  mediaUrl?: string;
  auth: TenancyAuth;
};

export type NodeReviewResult = {
  success: boolean;
  noop?: boolean;
};

@Injectable()
export class PipelineNodeReviewService {
  private readonly logger = new Logger(PipelineNodeReviewService.name);

  constructor(
    @Inject(PIPELINE_REPOSITORY)
    private readonly pipelineRepo: IPipelineRepository,
    private readonly resolver: DependencyResolverService,
  ) {}

  async reviewNode(input: NodeReviewInput): Promise<NodeReviewResult> {
    const pipeline = await this.pipelineRepo.findById(
      input.pipelineId,
      input.auth,
    );
    if (!pipeline) {
      throw new NotFoundException(`Pipeline ${input.pipelineId} not found`);
    }

    const node = this.pipelineRepo.getNode(pipeline, input.nodeId);
    if (!node) {
      throw new NotFoundException(`Node ${input.nodeId} not found`);
    }

    if (node.status !== PipelineNodeExecutionStatus.WaitingReview) {
      return { success: true, noop: true };
    }

    if (
      node.type === WorkflowNodeType.Merge ||
      node.type === WorkflowNodeType.Branch
    ) {
      throw new BadRequestException('Structural nodes cannot be reviewed');
    }

    switch (input.action) {
      case 'continue':
        return this.continueAsIs(input.pipelineId, input.nodeId, node);
      case 'edit':
        return this.editAndContinue(input, node.type);
      case 'regenerate':
        return this.regenerate(input, node);
      default:
        throw new BadRequestException('Invalid review action');
    }
  }

  private async continueAsIs(
    pipelineId: string,
    nodeId: string,
    node: { output: string | null },
  ): Promise<NodeReviewResult> {
    const output = parsePipelineNodeOutputString(node.output) ?? {};
    await this.pipelineRepo.updateNodeStatus(
      pipelineId,
      nodeId,
      PipelineNodeExecutionStatus.Completed,
      output,
    );
    await this.resolver.onNodeCompleted(pipelineId, nodeId);
    return { success: true };
  }

  private async editAndContinue(
    input: NodeReviewInput,
    nodeType: string,
  ): Promise<NodeReviewResult> {
    if (input.action !== 'edit') {
      throw new BadRequestException('Invalid action');
    }
    if (!isTextReviewNode(nodeType) && !isMediaReviewNode(nodeType)) {
      throw new BadRequestException('This node type does not support edits');
    }

    const output = buildEditedOutput(
      nodeType,
      input.editedContent,
      input.mediaUrl,
    );

    await this.pipelineRepo.updateNodeStatus(
      input.pipelineId,
      input.nodeId,
      PipelineNodeExecutionStatus.Completed,
      output,
    );
    await this.resolver.onNodeCompleted(input.pipelineId, input.nodeId);
    return { success: true };
  }

  private async regenerate(
    input: NodeReviewInput,
    node: {
      nodeId: string;
      type: string;
      userPrompt: string;
      reviewRegenerateCount?: number;
    },
  ): Promise<NodeReviewResult> {
    const instruction = input.regenerateInstruction?.trim() ?? '';
    await this.pipelineRepo.prepareNodeForReviewRegenerate(
      input.pipelineId,
      input.nodeId,
      {
        reviewRegeneratePrompt: instruction || null,
        clearOutput: isMediaReviewNode(node.type),
      },
    );

    await this.resolver.enqueueNodeForReviewRegenerate(
      input.pipelineId,
      input.nodeId,
    );

    this.logger.log(
      `[pipeline:${input.pipelineId}] regenerate review node=${input.nodeId}`,
    );
    return { success: true };
  }
}
