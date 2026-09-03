import { WorkflowNodeType } from '../nodes/schemas/workflow-node.schema';
import {
  assertEdgesRespectMatrix,
  buildWorkflowEdges,
} from './workflow-graph-edge-builder.util';
import { expandGraphLaneTemplates } from './workflow-graph-expand.util';
import {
  collapsePipelineToWorkflowTemplate,
  stripLaneSuffix,
  type PipelineNodeInput,
} from './pipeline-to-workflow-template.util';

describe('stripLaneSuffix', () => {
  it('strips known lane suffixes', () => {
    expect(
      stripLaneSuffix('adapt__instagram', ['instagram', 'linkedin']),
    ).toEqual({
      baseId: 'adapt',
      lane: 'instagram',
    });
    expect(
      stripLaneSuffix('img-uuid__linkedin', ['instagram', 'linkedin']),
    ).toEqual({
      baseId: 'img-uuid',
      lane: 'linkedin',
    });
  });
});

describe('collapsePipelineToWorkflowTemplate', () => {
  it('collapses a linear pipeline snapshot', () => {
    const nodes: PipelineNodeInput[] = [
      {
        nodeId: 'kw',
        type: WorkflowNodeType.KeywordPlanner,
        order: 1,
        isLocked: false,
        config: {},
      },
      {
        nodeId: 'text',
        type: WorkflowNodeType.TextGeneration,
        order: 2,
        isLocked: true,
        config: {},
      },
      {
        nodeId: 'img',
        type: WorkflowNodeType.ImageGeneration,
        order: 3,
        isLocked: false,
        config: { size: '1024x1024' },
        userPrompt: 'minimal',
      },
    ];
    const edges = [
      { from: 'kw', to: 'text' },
      { from: 'text', to: 'img' },
    ];
    const layout = {
      kw: { x: 0, y: 0 },
      text: { x: 220, y: 0 },
      img: { x: 440, y: 0 },
    };

    const collapsed = collapsePipelineToWorkflowTemplate(nodes, {
      edges,
      lanes: [],
      layout,
    });

    expect(collapsed.nodes.map((n) => n.nodeId)).toEqual(['kw', 'text', 'img']);
    expect(collapsed.edges).toEqual(edges);
    expect(collapsed.layout.text).toEqual({ x: 220, y: 0 });
    expect(() =>
      assertEdgesRespectMatrix(
        collapsed.nodes.map((n) => ({ nodeId: n.nodeId, type: n.type })),
        collapsed.edges,
      ),
    ).not.toThrow();
  });

  it('collapses a multi-channel materialized pipeline graph', () => {
    const lanes = ['instagram', 'linkedin'];
    const nodes: PipelineNodeInput[] = [
      {
        nodeId: 'kw',
        type: WorkflowNodeType.KeywordPlanner,
        order: 1,
        isLocked: false,
        config: {},
      },
      {
        nodeId: 'text',
        type: WorkflowNodeType.TextGeneration,
        order: 2,
        isLocked: true,
        config: {},
      },
      {
        nodeId: 'adapt__instagram',
        type: WorkflowNodeType.Adapt,
        order: 3,
        isLocked: false,
        config: { channel: 'instagram', contentStyle: 'visual-first' },
        lane: 'instagram',
      },
      {
        nodeId: 'img__instagram',
        type: WorkflowNodeType.ImageGeneration,
        order: 4,
        isLocked: false,
        config: { size: '1024x1024' },
        lane: 'instagram',
      },
      {
        nodeId: 'adapt__linkedin',
        type: WorkflowNodeType.Adapt,
        order: 5,
        isLocked: false,
        config: { channel: 'linkedin', contentStyle: 'professional' },
        lane: 'linkedin',
      },
      {
        nodeId: 'img__linkedin',
        type: WorkflowNodeType.ImageGeneration,
        order: 6,
        isLocked: false,
        config: { size: '1024x1024' },
        lane: 'linkedin',
      },
      {
        nodeId: 'merge',
        type: WorkflowNodeType.Merge,
        order: 7,
        isLocked: false,
        config: {},
      },
    ];
    const edges = [
      { from: 'kw', to: 'text' },
      { from: 'text', to: 'adapt__instagram' },
      { from: 'text', to: 'adapt__linkedin' },
      { from: 'adapt__instagram', to: 'img__instagram' },
      { from: 'adapt__linkedin', to: 'img__linkedin' },
      { from: 'img__instagram', to: 'merge' },
      { from: 'img__linkedin', to: 'merge' },
    ];
    const layout = {
      branch: { x: 440, y: 0 },
      kw: { x: 0, y: 0 },
      text: { x: 220, y: 0 },
      merge: { x: 880, y: 0 },
      adapt: { x: 550, y: 0 },
      img: { x: 660, y: 0 },
    };

    const collapsed = collapsePipelineToWorkflowTemplate(nodes, {
      edges,
      lanes,
      layout,
    });

    expect(
      collapsed.nodes.some((n) => n.type === WorkflowNodeType.Branch),
    ).toBe(true);
    expect(collapsed.nodes.some((n) => n.type === WorkflowNodeType.Merge)).toBe(
      true,
    );
    const adaptTemplates = collapsed.nodes.filter(
      (n) => n.type === WorkflowNodeType.Adapt,
    );
    expect(adaptTemplates).toHaveLength(1);
    expect(adaptTemplates[0]?.config).not.toHaveProperty('laneId');
    expect(adaptTemplates[0]?.config).not.toHaveProperty('channel');

    const imageTemplates = collapsed.nodes.filter(
      (n) => n.type === WorkflowNodeType.ImageGeneration,
    );
    expect(imageTemplates).toHaveLength(1);
    expect(imageTemplates[0]?.config).not.toHaveProperty('laneId');

    const expanded = expandGraphLaneTemplates(collapsed.nodes, lanes);
    expect(
      expanded.filter((n) => n.type === WorkflowNodeType.ImageGeneration),
    ).toHaveLength(2);
    const expandedEdges = buildWorkflowEdges(expanded);
    expect(() =>
      assertEdgesRespectMatrix(
        expanded.map((n) => ({ nodeId: n.nodeId, type: n.type })),
        expandedEdges,
      ),
    ).not.toThrow();
    expect(expandedEdges.some((e) => e.sourceHandle === 'instagram')).toBe(
      true,
    );
    expect(expandedEdges.some((e) => e.sourceHandle === 'linkedin')).toBe(true);
  });

  it('collapses heterogeneous per-lane templates and rebuilds branch edges', () => {
    const lanes = ['facebook', 'instagram', 'linkedin', 'tiktok'];
    const nodes: PipelineNodeInput[] = [
      {
        nodeId: 'kw',
        type: WorkflowNodeType.KeywordPlanner,
        order: 1,
        isLocked: false,
        config: {},
      },
      {
        nodeId: 'text',
        type: WorkflowNodeType.TextGeneration,
        order: 2,
        isLocked: true,
        config: {},
      },
      {
        nodeId: 'adapt__facebook',
        type: WorkflowNodeType.Adapt,
        order: 3,
        isLocked: false,
        config: { channel: 'facebook' },
        lane: 'facebook',
      },
      {
        nodeId: 'img__instagram',
        type: WorkflowNodeType.ImageGeneration,
        order: 4,
        isLocked: false,
        config: { size: '1024x1024' },
        lane: 'instagram',
      },
      {
        nodeId: 'adapt__linkedin',
        type: WorkflowNodeType.Adapt,
        order: 5,
        isLocked: false,
        config: { channel: 'linkedin' },
        lane: 'linkedin',
      },
      {
        nodeId: 'sum__linkedin',
        type: WorkflowNodeType.Summarization,
        order: 6,
        isLocked: false,
        config: {},
        lane: 'linkedin',
      },
      {
        nodeId: 'sum__tiktok',
        type: WorkflowNodeType.Summarization,
        order: 7,
        isLocked: false,
        config: {},
        lane: 'tiktok',
      },
      {
        nodeId: 'merge',
        type: WorkflowNodeType.Merge,
        order: 8,
        isLocked: false,
        config: {},
      },
    ];
    const edges = [
      { from: 'kw', to: 'text' },
      { from: 'text', to: 'adapt__facebook' },
      { from: 'text', to: 'img__instagram' },
      { from: 'text', to: 'adapt__linkedin' },
      { from: 'text', to: 'sum__tiktok' },
      { from: 'adapt__linkedin', to: 'sum__linkedin' },
      { from: 'adapt__facebook', to: 'merge' },
      { from: 'img__instagram', to: 'merge' },
      { from: 'sum__linkedin', to: 'merge' },
      { from: 'sum__tiktok', to: 'merge' },
    ];

    const collapsed = collapsePipelineToWorkflowTemplate(nodes, {
      edges,
      lanes,
      layout: { branch: { x: 440, y: 0 }, merge: { x: 1200, y: 0 } },
    });

    expect(
      collapsed.nodes.filter((n) => n.type === WorkflowNodeType.Adapt),
    ).toHaveLength(4);
    expect(
      collapsed.nodes.filter(
        (n) => n.type === WorkflowNodeType.ImageGeneration,
      ),
    ).toHaveLength(1);
    expect(
      collapsed.nodes.filter((n) => n.type === WorkflowNodeType.Summarization),
    ).toHaveLength(2);
    expect(
      collapsed.nodes.some((n) => n.type === WorkflowNodeType.Branch),
    ).toBe(true);
    const expanded = expandGraphLaneTemplates(collapsed.nodes, lanes);
    const expandedEdges = buildWorkflowEdges(expanded);
    expect(
      expandedEdges.some(
        (e) => e.sourceHandle === 'instagram' || e.targetHandle === 'instagram',
      ),
    ).toBe(true);
    expect(() =>
      assertEdgesRespectMatrix(
        expanded.map((n) => ({ nodeId: n.nodeId, type: n.type })),
        expandedEdges,
      ),
    ).not.toThrow();
  });

  it('collapses single shared adapt with heterogeneous lane entries without adapt→adapt edges', () => {
    const lanes = ['facebook', 'instagram', 'linkedin', 'tiktok'];
    const nodes: PipelineNodeInput[] = [
      {
        nodeId: 'text',
        type: WorkflowNodeType.TextGeneration,
        order: 1,
        isLocked: true,
        config: {},
      },
      {
        nodeId: 'adapt__facebook',
        type: WorkflowNodeType.Adapt,
        order: 2,
        isLocked: false,
        config: { channel: 'facebook' },
        lane: 'facebook',
      },
      {
        nodeId: 'img__instagram',
        type: WorkflowNodeType.ImageGeneration,
        order: 3,
        isLocked: false,
        config: { size: '1024x1024' },
        lane: 'instagram',
      },
      {
        nodeId: 'merge',
        type: WorkflowNodeType.Merge,
        order: 4,
        isLocked: false,
        config: {},
      },
    ];
    const edges = [
      { from: 'text', to: 'adapt__facebook' },
      { from: 'text', to: 'img__instagram' },
      { from: 'adapt__facebook', to: 'merge' },
      { from: 'img__instagram', to: 'merge' },
    ];

    const collapsed = collapsePipelineToWorkflowTemplate(nodes, {
      edges,
      lanes,
      layout: {},
    });

    const sharedAdapt = collapsed.nodes.find(
      (n) => n.type === WorkflowNodeType.Adapt && !n.lane,
    );
    expect(sharedAdapt).toBeUndefined();
    expect(
      collapsed.nodes.filter((n) => n.type === WorkflowNodeType.Adapt),
    ).toHaveLength(2);

    const expanded = expandGraphLaneTemplates(collapsed.nodes, lanes);
    const edgesBuilt = buildWorkflowEdges(expanded);
    expect(() =>
      assertEdgesRespectMatrix(
        expanded.map((n) => ({ nodeId: n.nodeId, type: n.type })),
        edgesBuilt,
      ),
    ).not.toThrow();
    for (const lane of lanes) {
      const laneAdapts = expanded.filter(
        (n) =>
          n.type === WorkflowNodeType.Adapt &&
          (n.lane === lane || n.config.laneId === lane),
      );
      expect(laneAdapts.length).toBeLessThanOrEqual(1);
    }
  });

  it('treats a single materialized adapt as a shared lane template when graph has multiple lanes', () => {
    const lanes = ['instagram', 'linkedin', 'facebook', 'tiktok'];
    const nodes: PipelineNodeInput[] = [
      {
        nodeId: 'text',
        type: WorkflowNodeType.TextGeneration,
        order: 1,
        isLocked: true,
        config: {},
      },
      {
        nodeId: 'adapt__instagram',
        type: WorkflowNodeType.Adapt,
        order: 2,
        isLocked: false,
        config: { channel: 'instagram' },
        lane: 'instagram',
      },
      {
        nodeId: 'merge',
        type: WorkflowNodeType.Merge,
        order: 3,
        isLocked: false,
        config: {},
      },
    ];

    const collapsed = collapsePipelineToWorkflowTemplate(nodes, {
      edges: [
        { from: 'text', to: 'adapt__instagram' },
        { from: 'adapt__instagram', to: 'merge' },
      ],
      lanes,
      layout: {},
    });

    const adapt = collapsed.nodes.find(
      (n) => n.type === WorkflowNodeType.Adapt,
    );
    expect(adapt).toBeDefined();
    expect(adapt?.config).not.toHaveProperty('laneId');
    expect(adapt?.lane).toBeNull();
  });
});
