import { WorkflowNodeType } from '../nodes/schemas/workflow-node.schema';
import {
  PipelineNodeExecutionStatus,
  type PipelineDocument,
} from './schemas/pipeline.schema';
import { PipelineRepository } from './pipeline.repository';

describe('PipelineRepository.buildAncestorOutputs', () => {
  const repo = Object.create(PipelineRepository.prototype) as PipelineRepository;

  const pipeline = {
    graph: {
      edges: [
        { from: 'text', to: 'image' },
        { from: 'text', to: 'trans' },
        { from: 'image', to: 'video' },
        { from: 'trans', to: 'video' },
      ],
    },
    nodes: [
      {
        nodeId: 'text',
        type: WorkflowNodeType.TextGeneration,
        order: 1,
        lane: null,
        status: PipelineNodeExecutionStatus.Completed,
        output: JSON.stringify({ text: 'hello' }),
      },
      {
        nodeId: 'image',
        type: WorkflowNodeType.ImageGeneration,
        order: 2,
        lane: null,
        status: PipelineNodeExecutionStatus.Completed,
        output: JSON.stringify({ image: 'img.png' }),
      },
      {
        nodeId: 'trans',
        type: WorkflowNodeType.Translation,
        order: 3,
        lane: null,
        status: PipelineNodeExecutionStatus.Completed,
        output: JSON.stringify({ translatedText: 'สวัสดี' }),
      },
      {
        nodeId: 'video',
        type: WorkflowNodeType.VideoGeneration,
        order: 4,
        lane: null,
        status: PipelineNodeExecutionStatus.Pending,
        output: null,
      },
    ],
  } as unknown as PipelineDocument;

  it('merges all ancestor outputs for fan-in target', () => {
    const outputs = repo.buildAncestorOutputs(pipeline, 'video');
    expect(outputs.text).toBe('hello');
    expect(outputs.image).toBe('img.png');
    expect(outputs.translatedText).toBe('สวัสดี');
  });

  it('stacks intelligenceBrief from multiple intelligence ancestors', () => {
    const intelPipeline = {
      graph: {
        edges: [
          { from: 'intel1', to: 'intel2' },
          { from: 'intel2', to: 'text' },
        ],
      },
      nodes: [
        {
          nodeId: 'intel1',
          type: WorkflowNodeType.Intelligence,
          order: 1,
          lane: null,
          status: PipelineNodeExecutionStatus.Completed,
          output: JSON.stringify({ intelligenceBrief: 'Trend brief' }),
        },
        {
          nodeId: 'intel2',
          type: WorkflowNodeType.Intelligence,
          order: 2,
          lane: null,
          status: PipelineNodeExecutionStatus.Completed,
          output: JSON.stringify({ intelligenceBrief: 'Competitor brief' }),
        },
        {
          nodeId: 'text',
          type: WorkflowNodeType.TextGeneration,
          order: 3,
          lane: null,
          status: PipelineNodeExecutionStatus.Pending,
          output: null,
        },
      ],
    } as unknown as PipelineDocument;

    const outputs = repo.buildAncestorOutputs(intelPipeline, 'text');
    expect(outputs.intelligenceBrief).toBe(
      'Trend brief\n\n---\n\nCompetitor brief',
    );
  });

  it('excludes sibling lane outputs for lane-scoped node', () => {
    const lanePipeline = {
      graph: {
        edges: [
          { from: 'text', to: 'adapt_ig' },
          { from: 'text', to: 'adapt_fb' },
        ],
      },
      nodes: [
        {
          nodeId: 'text',
          lane: null,
          status: PipelineNodeExecutionStatus.Completed,
          output: JSON.stringify({ text: 'base' }),
        },
        {
          nodeId: 'adapt_ig',
          lane: 'instagram',
          status: PipelineNodeExecutionStatus.Completed,
          output: JSON.stringify({ text: 'ig copy' }),
        },
        {
          nodeId: 'adapt_fb',
          lane: 'facebook',
          status: PipelineNodeExecutionStatus.Completed,
          output: JSON.stringify({ text: 'fb copy' }),
        },
      ],
    } as unknown as PipelineDocument;
    const outputs = repo.buildAncestorOutputs(lanePipeline, 'adapt_ig');
    expect(outputs.text).toBe('base');
    expect(outputs.text).not.toBe('fb copy');
  });
});
