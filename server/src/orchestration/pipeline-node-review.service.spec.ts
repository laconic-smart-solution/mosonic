jest.mock('./dependency-resolver.service', () => ({
  DependencyResolverService: class {
    onNodeCompleted = jest.fn();
    enqueueNodeForReviewRegenerate = jest.fn();
  },
}));

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WorkflowNodeType } from '../nodes/schemas/workflow-node.schema';
import { PipelineNodeExecutionStatus } from '../pipeline/schemas/pipeline.schema';
import { PipelineNodeReviewService } from './pipeline-node-review.service';

describe('PipelineNodeReviewService', () => {
  const pipelineRepo = {
    findById: jest.fn(),
    getNode: jest.fn(),
    updateNodeStatus: jest.fn(),
    prepareNodeForReviewRegenerate: jest.fn(),
  };
  const resolver = {
    onNodeCompleted: jest.fn(),
    enqueueNodeForReviewRegenerate: jest.fn(),
  };

  const service = new PipelineNodeReviewService(
    pipelineRepo as never,
    resolver as never,
  );

  const auth = { userId: 'u1', orgId: 'o1' } as never;

  const pipeline = {
    pipelineId: 'p1',
    nodes: [],
  };

  const waitingNode = {
    nodeId: 'text-1',
    type: WorkflowNodeType.TextGeneration,
    status: PipelineNodeExecutionStatus.WaitingReview,
    output: JSON.stringify({ text: 'original' }),
    userPrompt: '',
    reviewRegenerateCount: 0,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    pipelineRepo.findById.mockResolvedValue(pipeline);
    pipelineRepo.getNode.mockReturnValue(waitingNode);
    pipelineRepo.updateNodeStatus.mockResolvedValue(undefined);
    pipelineRepo.prepareNodeForReviewRegenerate.mockResolvedValue(undefined);
    resolver.onNodeCompleted.mockResolvedValue(undefined);
    resolver.enqueueNodeForReviewRegenerate.mockResolvedValue(undefined);
  });

  it('returns noop when node is not waiting_review', async () => {
    pipelineRepo.getNode.mockReturnValue({
      ...waitingNode,
      status: PipelineNodeExecutionStatus.Completed,
    });

    const result = await service.reviewNode({
      pipelineId: 'p1',
      nodeId: 'text-1',
      action: 'continue',
      auth,
    });

    expect(result).toEqual({ success: true, noop: true });
    expect(resolver.onNodeCompleted).not.toHaveBeenCalled();
  });

  it('continue keeps output and enqueues downstream', async () => {
    const result = await service.reviewNode({
      pipelineId: 'p1',
      nodeId: 'text-1',
      action: 'continue',
      auth,
    });

    expect(result).toEqual({ success: true });
    expect(pipelineRepo.updateNodeStatus).toHaveBeenCalledWith(
      'p1',
      'text-1',
      PipelineNodeExecutionStatus.Completed,
      { text: 'original' },
    );
    expect(resolver.onNodeCompleted).toHaveBeenCalledWith('p1', 'text-1');
  });

  it('edit rejects empty text content', async () => {
    await expect(
      service.reviewNode({
        pipelineId: 'p1',
        nodeId: 'text-1',
        action: 'edit',
        editedContent: '   ',
        auth,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('edit persists trimmed content and continues', async () => {
    const result = await service.reviewNode({
      pipelineId: 'p1',
      nodeId: 'text-1',
      action: 'edit',
      editedContent: '  edited copy  ',
      auth,
    });

    expect(result).toEqual({ success: true });
    expect(pipelineRepo.updateNodeStatus).toHaveBeenCalledWith(
      'p1',
      'text-1',
      PipelineNodeExecutionStatus.Completed,
      { text: 'edited copy' },
    );
    expect(resolver.onNodeCompleted).toHaveBeenCalledWith('p1', 'text-1');
  });

  it('regenerate prepares node and enqueues replay job', async () => {
    const result = await service.reviewNode({
      pipelineId: 'p1',
      nodeId: 'text-1',
      action: 'regenerate',
      regenerateInstruction: ' make it shorter ',
      auth,
    });

    expect(result).toEqual({ success: true });
    expect(pipelineRepo.prepareNodeForReviewRegenerate).toHaveBeenCalledWith(
      'p1',
      'text-1',
      expect.objectContaining({ reviewRegeneratePrompt: 'make it shorter' }),
    );
    expect(resolver.enqueueNodeForReviewRegenerate).toHaveBeenCalledWith(
      'p1',
      'text-1',
    );
    expect(resolver.onNodeCompleted).not.toHaveBeenCalled();
  });

  it('throws when pipeline is missing', async () => {
    pipelineRepo.findById.mockResolvedValue(null);

    await expect(
      service.reviewNode({
        pipelineId: 'p1',
        nodeId: 'text-1',
        action: 'continue',
        auth,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
