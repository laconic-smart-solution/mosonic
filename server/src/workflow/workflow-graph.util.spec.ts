import { WorkflowNodeType } from '../nodes/schemas/workflow-node.schema';
import {
  areAllDependenciesMet,
  assignOrderFromGraph,
  buildLinearEdgesFromOrder,
  getAncestors,
  getRoots,
  hasCycle,
  topologicalSort,
  validateWorkflowGraph,
} from './workflow-graph.util';

describe('workflow-graph.util', () => {
  const dagNodes = [
    { nodeId: 'text', type: WorkflowNodeType.TextGeneration, order: 1 },
    { nodeId: 'image', type: WorkflowNodeType.ImageGeneration, order: 2 },
    { nodeId: 'trans', type: WorkflowNodeType.Translation, order: 3 },
    { nodeId: 'video', type: WorkflowNodeType.VideoGeneration, order: 4 },
  ];
  const dagEdges = [
    { from: 'text', to: 'image' },
    { from: 'text', to: 'trans' },
    { from: 'image', to: 'video' },
    { from: 'trans', to: 'video' },
  ];

  it('detects cycles', () => {
    expect(
      hasCycle(
        ['a', 'b', 'c'],
        [
          { from: 'a', to: 'b' },
          { from: 'b', to: 'c' },
          { from: 'c', to: 'a' },
        ],
      ),
    ).toBe(true);
    expect(hasCycle(['a', 'b'], [{ from: 'a', to: 'b' }])).toBe(false);
  });

  it('finds roots and ancestors', () => {
    expect(
      getRoots(
        dagNodes.map((n) => n.nodeId),
        dagEdges,
      ),
    ).toEqual(['text']);
    expect(getAncestors(dagEdges, 'video')).toEqual(
      new Set(['text', 'image', 'trans']),
    );
  });

  it('topologically sorts ancestors', () => {
    const sorted = topologicalSort(
      ['text', 'image', 'trans', 'video'],
      dagEdges,
    );
    expect(sorted.indexOf('text')).toBeLessThan(sorted.indexOf('image'));
    expect(sorted.indexOf('text')).toBeLessThan(sorted.indexOf('trans'));
    expect(sorted.indexOf('image')).toBeLessThan(sorted.indexOf('video'));
    expect(sorted.indexOf('trans')).toBeLessThan(sorted.indexOf('video'));
  });

  it('validates fan-in dependencies', () => {
    const pipelineNodes = [
      { nodeId: 'text', status: 'completed' },
      { nodeId: 'image', status: 'completed' },
      { nodeId: 'trans', status: 'pending' },
      { nodeId: 'video', status: 'pending' },
    ];
    const terminal = new Set(['completed', 'skipped']);
    expect(
      areAllDependenciesMet('image', pipelineNodes, dagEdges, terminal),
    ).toBe(true);
    expect(
      areAllDependenciesMet('video', pipelineNodes, dagEdges, terminal),
    ).toBe(false);
    pipelineNodes[2].status = 'completed';
    expect(
      areAllDependenciesMet('video', pipelineNodes, dagEdges, terminal),
    ).toBe(true);
  });

  it('builds linear edges from order', () => {
    expect(
      buildLinearEdgesFromOrder([
        { nodeId: 'a', order: 1 },
        { nodeId: 'b', order: 2 },
      ]),
    ).toEqual([{ from: 'a', to: 'b' }]);
  });

  it('rejects cyclic graphs on validate', () => {
    expect(() =>
      validateWorkflowGraph(
        [
          { nodeId: 'text', type: WorkflowNodeType.TextGeneration, order: 1 },
          { nodeId: 'image', type: WorkflowNodeType.ImageGeneration, order: 2 },
          { nodeId: 'trans', type: WorkflowNodeType.Translation, order: 3 },
        ],
        [
          { from: 'text', to: 'image' },
          { from: 'image', to: 'trans' },
          { from: 'trans', to: 'image' },
        ],
      ),
    ).toThrow(/cycle/i);
  });

  it('accepts intelligence → text without keyword planner', () => {
    expect(() =>
      validateWorkflowGraph(
        [
          { nodeId: 'intel', type: WorkflowNodeType.Intelligence, order: 1 },
          { nodeId: 'text', type: WorkflowNodeType.TextGeneration, order: 2 },
        ],
        [{ from: 'intel', to: 'text' }],
      ),
    ).not.toThrow();
  });

  it('rejects intelligence downstream of text', () => {
    expect(() =>
      validateWorkflowGraph(
        [
          { nodeId: 'text', type: WorkflowNodeType.TextGeneration, order: 1 },
          { nodeId: 'intel', type: WorkflowNodeType.Intelligence, order: 2 },
        ],
        [{ from: 'text', to: 'intel' }],
      ),
    ).toThrow(/intelligence must run before text_generation/i);
  });

  it('accepts two text nodes in one connected graph', () => {
    expect(() =>
      validateWorkflowGraph(
        [
          { nodeId: 'text1', type: WorkflowNodeType.TextGeneration, order: 1 },
          { nodeId: 'text2', type: WorkflowNodeType.TextGeneration, order: 2 },
          { nodeId: 'image', type: WorkflowNodeType.ImageGeneration, order: 3 },
        ],
        [
          { from: 'text1', to: 'text2' },
          { from: 'text2', to: 'image' },
        ],
      ),
    ).not.toThrow();
  });

  it('rejects disconnected subgraphs when explicit edges are present', () => {
    expect(() =>
      validateWorkflowGraph(
        [
          { nodeId: 'a', type: WorkflowNodeType.TextGeneration, order: 1 },
          { nodeId: 'b', type: WorkflowNodeType.ImageGeneration, order: 2 },
        ],
        [{ from: 'a', to: 'b' }],
      ),
    ).not.toThrow();

    expect(() =>
      validateWorkflowGraph(
        [
          { nodeId: 'a', type: WorkflowNodeType.TextGeneration, order: 1 },
          { nodeId: 'b', type: WorkflowNodeType.ImageGeneration, order: 2 },
          { nodeId: 'c', type: WorkflowNodeType.VideoGeneration, order: 3 },
        ],
        [{ from: 'a', to: 'b' }],
      ),
    ).toThrow(/disconnected/i);
  });

  it('rejects video without text ancestor when text exists in graph', () => {
    expect(() =>
      validateWorkflowGraph(
        [
          { nodeId: 'text', type: WorkflowNodeType.TextGeneration, order: 1 },
          { nodeId: 'image', type: WorkflowNodeType.ImageGeneration, order: 2 },
          { nodeId: 'video', type: WorkflowNodeType.VideoGeneration, order: 3 },
        ],
        [
          { from: 'text', to: 'image' },
          { from: 'image', to: 'video' },
        ],
      ),
    ).not.toThrow();

    expect(() =>
      validateWorkflowGraph(
        [
          { nodeId: 'text', type: WorkflowNodeType.TextGeneration, order: 1 },
          { nodeId: 'video', type: WorkflowNodeType.VideoGeneration, order: 2 },
        ],
        [{ from: 'text', to: 'video' }],
      ),
    ).not.toThrow();

    expect(() =>
      validateWorkflowGraph(
        [
          { nodeId: 'text', type: WorkflowNodeType.TextGeneration, order: 1 },
          { nodeId: 'branch', type: WorkflowNodeType.Branch, order: 2 },
          { nodeId: 'adapt', type: WorkflowNodeType.Adapt, order: 3 },
          { nodeId: 'video', type: WorkflowNodeType.VideoGeneration, order: 4 },
          { nodeId: 'merge', type: WorkflowNodeType.Merge, order: 5 },
        ],
        [
          { from: 'text', to: 'branch' },
          { from: 'branch', to: 'adapt', sourceHandle: 'instagram' },
          { from: 'adapt', to: 'video' },
          { from: 'video', to: 'merge', targetHandle: 'instagram' },
        ],
      ),
    ).not.toThrow();
  });

  it('assignOrderFromGraph uses topological order instead of client order', () => {
    const nodes = [
      { nodeId: 'text', type: WorkflowNodeType.TextGeneration, order: 5 },
      { nodeId: 'video', type: WorkflowNodeType.VideoGeneration, order: 1 },
    ];
    const edges = [{ from: 'text', to: 'video' }];
    const ordered = assignOrderFromGraph(nodes, edges);
    expect(ordered.find((n) => n.nodeId === 'text')?.order).toBe(1);
    expect(ordered.find((n) => n.nodeId === 'video')?.order).toBe(2);
  });

  it('assignOrderFromGraph keeps disconnected nodes after the connected graph', () => {
    const nodes = [
      { nodeId: 'keyword', type: WorkflowNodeType.KeywordPlanner, order: 1 },
      {
        nodeId: 'orphan_video',
        type: WorkflowNodeType.VideoGeneration,
        order: 2,
      },
      { nodeId: 'text', type: WorkflowNodeType.TextGeneration, order: 3 },
      { nodeId: 'branch', type: WorkflowNodeType.Branch, order: 4 },
    ];
    const edges = [
      { from: 'keyword', to: 'text' },
      { from: 'text', to: 'branch' },
    ];
    const ordered = assignOrderFromGraph(nodes, edges);
    expect(ordered.find((n) => n.nodeId === 'keyword')?.order).toBe(1);
    expect(ordered.find((n) => n.nodeId === 'text')?.order).toBe(2);
    expect(ordered.find((n) => n.nodeId === 'branch')?.order).toBe(3);
    expect(ordered.find((n) => n.nodeId === 'orphan_video')?.order).toBe(4);
  });

  it('rejects workflows with disconnected nodes before order checks', () => {
    expect(() =>
      validateWorkflowGraph(
        [
          {
            nodeId: 'keyword',
            type: WorkflowNodeType.KeywordPlanner,
            order: 1,
          },
          {
            nodeId: 'orphan_video',
            type: WorkflowNodeType.VideoGeneration,
            order: 2,
          },
          { nodeId: 'text', type: WorkflowNodeType.TextGeneration, order: 3 },
          { nodeId: 'branch', type: WorkflowNodeType.Branch, order: 4 },
        ],
        [
          { from: 'keyword', to: 'text' },
          { from: 'text', to: 'branch' },
        ],
      ),
    ).toThrow(/disconnected/i);
  });
});
