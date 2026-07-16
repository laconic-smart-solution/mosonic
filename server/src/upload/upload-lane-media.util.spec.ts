import { WorkflowNodeType } from '../nodes/schemas/workflow-node.schema';
import { PipelineNodeExecutionStatus } from '../pipeline/schemas/pipeline.schema';
import {
  laneMediaFromPipelineNodes,
  trunkMediaFromPipelineNodes,
} from './upload-lane-media.util';

describe('laneMediaFromPipelineNodes', () => {
  it('returns last-wins lane image and video URLs', () => {
    const nodes = [
      {
        lane: 'instagram',
        type: WorkflowNodeType.ImageGeneration,
        status: PipelineNodeExecutionStatus.Completed,
        output: JSON.stringify({ image: 'https://cdn.example/ig-v1.jpg' }),
      },
      {
        lane: 'instagram',
        type: WorkflowNodeType.ImageGeneration,
        status: PipelineNodeExecutionStatus.Completed,
        output: JSON.stringify({ image: 'https://cdn.example/ig-v2.jpg' }),
      },
      {
        lane: 'instagram',
        type: WorkflowNodeType.VideoGeneration,
        status: PipelineNodeExecutionStatus.Completed,
        output: JSON.stringify({ video: 'https://cdn.example/ig.mp4' }),
      },
      {
        lane: 'facebook',
        type: WorkflowNodeType.ImageGeneration,
        status: PipelineNodeExecutionStatus.Completed,
        output: JSON.stringify({ image: 'https://cdn.example/fb.jpg' }),
      },
    ];

    expect(laneMediaFromPipelineNodes(nodes, 'instagram')).toEqual({
      image: 'https://cdn.example/ig-v2.jpg',
      video: 'https://cdn.example/ig.mp4',
    });
    expect(laneMediaFromPipelineNodes(nodes, 'facebook')).toEqual({
      image: 'https://cdn.example/fb.jpg',
    });
  });

  it('ignores nodes on other lanes and non-completed status', () => {
    const nodes = [
      {
        lane: 'instagram',
        type: WorkflowNodeType.ImageGeneration,
        status: PipelineNodeExecutionStatus.Running,
        output: JSON.stringify({ image: 'https://cdn.example/running.jpg' }),
      },
    ];

    expect(laneMediaFromPipelineNodes(nodes, 'instagram')).toEqual({});
  });
});

describe('trunkMediaFromPipelineNodes', () => {
  it('returns media only from unlaned nodes', () => {
    const nodes = [
      {
        lane: null,
        type: WorkflowNodeType.ImageGeneration,
        status: PipelineNodeExecutionStatus.Completed,
        output: JSON.stringify({ image: 'https://cdn.example/shared.jpg' }),
      },
      {
        lane: 'facebook',
        type: WorkflowNodeType.ImageGeneration,
        status: PipelineNodeExecutionStatus.Completed,
        output: JSON.stringify({ image: 'https://cdn.example/fb.jpg' }),
      },
    ];

    expect(trunkMediaFromPipelineNodes(nodes)).toEqual({
      image: 'https://cdn.example/shared.jpg',
    });
  });
});
