import {
  PipelineNodeExecutionStatus,
  type PipelineRecord,
} from '../domain/pipeline/pipeline.types';
import { buildContentRerunPreviousOutputs } from './content-rerun-previous-outputs.util';

describe('buildContentRerunPreviousOutputs', () => {
  function pipelineWith(
    nodes: Array<{
      nodeId: string;
      type: string;
      order: number;
      status: PipelineNodeExecutionStatus;
      output: string | null;
      lane?: string | null;
    }>,
    edges: Array<{ from: string; to: string }>,
  ): PipelineRecord {
    return {
      pipelineId: 'p1',
      nodes,
      graph: { edges, lanes: ['facebook'] },
    } as unknown as PipelineRecord;
  }

  it('uses lane-specific adapt text for a materialized image node', () => {
    const pipeline = pipelineWith(
      [
        {
          nodeId: 'text',
          type: 'text_generation',
          order: 1,
          status: 'completed',
          output: JSON.stringify({ text: 'base post' }),
          lane: null,
        },
        {
          nodeId: 'adapt__facebook',
          type: 'adapt',
          order: 2,
          status: 'completed',
          output: JSON.stringify({ text: 'FB caption' }),
          lane: 'facebook',
        },
        {
          nodeId: 'img__facebook',
          type: 'image_generation',
          order: 3,
          status: 'completed',
          output: JSON.stringify({ image: 'https://old.png' }),
          lane: 'facebook',
        },
      ],
      [
        { from: 'text', to: 'adapt__facebook' },
        { from: 'adapt__facebook', to: 'img__facebook' },
      ],
    );

    const previous = buildContentRerunPreviousOutputs(
      pipeline,
      'img__facebook',
      {
        'adapt__facebook': { text: 'Edited FB caption' },
      },
      {},
    );

    expect(previous.text).toBe('Edited FB caption');
  });
});
