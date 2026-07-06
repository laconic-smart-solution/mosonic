jest.mock('./dependency-resolver.service', () => ({
  DependencyResolverService: class {
    onNodeCompleted = jest.fn();
  },
}));

import { WorkflowNodeType } from '../nodes/schemas/workflow-node.schema';
import {
  PipelineNodeExecutionStatus,
  PipelineUserExecutionMode,
} from '../pipeline/schemas/pipeline.schema';
import { PipelineNodeCompletionService } from './pipeline-node-completion.service';
import type { PipelineRecord } from '../domain/pipeline/pipeline.types';

describe('PipelineNodeCompletionService', () => {
  const pipelineRepo = {
    findById: jest.fn(),
    updateNodeStatus: jest.fn(),
  };
  const resolver = {
    onNodeCompleted: jest.fn(),
  };
  const events = {
    emitToPipeline: jest.fn(),
    emitUserNotification: jest.fn(),
  };

  const service = new PipelineNodeCompletionService(
    pipelineRepo as never,
    resolver as never,
    events as never,
  );

  const baseCtx = {
    pipelineId: 'p1',
    nodeId: 'text-1',
    nodeType: WorkflowNodeType.TextGeneration,
    order: 1,
    totalNodes: 3,
    output: { text: 'hello' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    pipelineRepo.updateNodeStatus.mockResolvedValue(undefined);
    resolver.onNodeCompleted.mockResolvedValue(undefined);
  });

  function mockPipeline(
    overrides: Partial<PipelineRecord> = {},
  ): PipelineRecord {
    return {
      pipelineId: 'p1',
      userId: 'u1',
      ruleRef: 'r1',
      executionMode: PipelineUserExecutionMode.Auto,
      metadata: { source: 'manual' },
      ...overrides,
    } as PipelineRecord;
  }

  it('auto mode completes node and enqueues downstream', async () => {
    pipelineRepo.findById.mockResolvedValue(mockPipeline());

    await service.handleNodeSucceeded(baseCtx);

    expect(pipelineRepo.updateNodeStatus).toHaveBeenCalledWith(
      'p1',
      'text-1',
      PipelineNodeExecutionStatus.Completed,
      baseCtx.output,
    );
    expect(events.emitToPipeline).toHaveBeenCalledWith(
      'p1',
      'node:completed',
      expect.objectContaining({ nodeId: 'text-1' }),
    );
    expect(resolver.onNodeCompleted).toHaveBeenCalledWith('p1', 'text-1');
    expect(events.emitToPipeline).not.toHaveBeenCalledWith(
      'p1',
      'node:waiting_review',
      expect.anything(),
    );
  });

  it('step mode pauses for review without enqueueing downstream', async () => {
    pipelineRepo.findById.mockResolvedValue(
      mockPipeline({ executionMode: PipelineUserExecutionMode.Step }),
    );

    await service.handleNodeSucceeded(baseCtx);

    expect(pipelineRepo.updateNodeStatus).toHaveBeenCalledWith(
      'p1',
      'text-1',
      PipelineNodeExecutionStatus.WaitingReview,
      baseCtx.output,
    );
    expect(events.emitToPipeline).toHaveBeenCalledWith(
      'p1',
      'node:waiting_review',
      expect.objectContaining({
        nodeId: 'text-1',
        output: baseCtx.output,
      }),
    );
    expect(events.emitUserNotification).toHaveBeenCalled();
    expect(resolver.onNodeCompleted).not.toHaveBeenCalled();
  });

  it('merge node passes through immediately in step mode', async () => {
    pipelineRepo.findById.mockResolvedValue(
      mockPipeline({ executionMode: PipelineUserExecutionMode.Step }),
    );

    await service.handleNodeSucceeded({
      ...baseCtx,
      nodeId: 'merge-1',
      nodeType: WorkflowNodeType.Merge,
    });

    expect(pipelineRepo.updateNodeStatus).toHaveBeenCalledWith(
      'p1',
      'merge-1',
      PipelineNodeExecutionStatus.Completed,
      baseCtx.output,
    );
    expect(resolver.onNodeCompleted).toHaveBeenCalledWith('p1', 'merge-1');
    expect(events.emitToPipeline).not.toHaveBeenCalledWith(
      'p1',
      'node:waiting_review',
      expect.anything(),
    );
  });
});
