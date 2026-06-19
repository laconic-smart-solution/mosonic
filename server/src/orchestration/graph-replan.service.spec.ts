jest.mock('./dependency-resolver.service', () => ({
  DependencyResolverService: class DependencyResolverService {
    enqueueReadyNodes = jest.fn().mockResolvedValue(undefined);
  },
}));

import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { GraphReplanService } from './graph-replan.service';
import { PIPELINE_REPOSITORY } from '../pipeline/pipeline.repository';
import { DependencyResolverService } from './dependency-resolver.service';
import {
  PipelineNodeExecutionStatus,
  PipelineStatus,
} from '../pipeline/schemas/pipeline.schema';
import { WorkflowNodeType } from '../nodes/schemas/workflow-node.schema';

describe('GraphReplanService', () => {
  let service: GraphReplanService;
  const pipelineRepo = {
    findById: jest.fn(),
  };
  const resolver = {
    enqueueReadyNodes: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        GraphReplanService,
        { provide: PIPELINE_REPOSITORY, useValue: pipelineRepo },
        { provide: DependencyResolverService, useValue: resolver },
      ],
    }).compile();
    service = moduleRef.get(GraphReplanService);
  });

  it('rejects replan when pipeline is not paused', async () => {
    pipelineRepo.findById.mockResolvedValue({
      pipelineId: 'p1',
      status: PipelineStatus.Running,
      nodes: [],
      graph: { edges: [] },
    });
    await expect(
      service.replan('p1', [{ op: 'skip_node', nodeId: 'n1' }]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('skips pending node and resumes', async () => {
    pipelineRepo.findById.mockResolvedValue({
      pipelineId: 'p1',
      status: PipelineStatus.Paused,
      nodes: [
        {
          nodeId: 'n1',
          type: WorkflowNodeType.TextGeneration,
          order: 1,
          status: PipelineNodeExecutionStatus.Pending,
          config: {},
          isLocked: false,
          userPrompt: '',
          input: '',
          output: null,
          retryCount: 0,
          executedAt: null,
          lane: null,
          variantId: null,
          lastError: null,
          externalJobId: null,
        },
      ],
      graph: { edges: [] },
    });
    const result = await service.replan('p1', [
      { op: 'skip_node', nodeId: 'n1' },
    ]);
    expect(result.success).toBe(true);
    expect(updateOne).toHaveBeenCalled();
    expect(resolver.enqueueReadyNodes).toHaveBeenCalledWith('p1');
  });

  it('rejects skip on completed node', async () => {
    pipelineRepo.findById.mockResolvedValue({
      pipelineId: 'p1',
      status: PipelineStatus.Paused,
      nodes: [
        {
          nodeId: 'n1',
          status: PipelineNodeExecutionStatus.Completed,
        },
      ],
      graph: { edges: [] },
    });
    await expect(
      service.replan('p1', [{ op: 'skip_node', nodeId: 'n1' }]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
