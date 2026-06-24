import { PrismaPipelineRepository } from '../repositories/prisma/prisma-pipeline.repository';
import {
  PipelineNodeExecutionStatus,
  type PipelineRecord,
} from '../domain/pipeline/pipeline.types';

describe('PrismaPipelineRepository.buildAncestorOutputs', () => {
  const repo = Object.create(
    PrismaPipelineRepository.prototype,
  ) as PrismaPipelineRepository;

  function pipelineWithNodes(
    nodes: Array<{
      nodeId: string;
      type: string;
      order: number;
      status: PipelineNodeExecutionStatus;
      output: string | null;
      lane?: string | null;
    }>,
    edges?: Array<{ from: string; to: string }>,
  ): PipelineRecord {
    return {
      pipelineId: 'p1',
      nodes,
      graph: edges ? { edges } : {},
    } as unknown as PipelineRecord;
  }

  it('returns outputs from completed ancestors only', () => {
    const pipeline = pipelineWithNodes(
      [
        {
          nodeId: 'a',
          type: 'text_generation',
          order: 1,
          status: 'completed',
          output: JSON.stringify({ text: 'hello' }),
        },
        {
          nodeId: 'b',
          type: 'image_generation',
          order: 2,
          status: 'pending',
          output: null,
        },
      ],
      [{ from: 'a', to: 'b' }],
    );

    const result = repo.buildAncestorOutputs(pipeline, 'b');
    expect(result.text).toBe('hello');
  });
});
