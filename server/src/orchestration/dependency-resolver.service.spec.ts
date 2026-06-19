import { WorkflowNodeType } from '../nodes/schemas/workflow-node.schema';
import {
  PipelineNodeExecutionStatus,
  PipelineStatus,
} from '../pipeline/schemas/pipeline.schema';
import {
  areAllDependenciesMet,
  buildLinearEdgesFromOrder,
  getOutgoing,
  getRoots,
} from '../workflow/workflow-graph.util';

describe('dependency resolver graph helpers', () => {
  const terminal = new Set<string>([
    PipelineNodeExecutionStatus.Completed,
    PipelineNodeExecutionStatus.Skipped,
  ]);

  it('enqueues parallel targets after fan-out', () => {
    const edges = [
      { from: 'text', to: 'image' },
      { from: 'text', to: 'trans' },
    ];
    const outbound = getOutgoing(edges, 'text');
    expect(outbound.map((e) => e.to).sort()).toEqual(['image', 'trans']);
  });

  it('fan-in requires both parents completed', () => {
    const edges = [
      { from: 'image', to: 'video' },
      { from: 'trans', to: 'video' },
    ];
    const nodes = [
      { nodeId: 'image', status: PipelineNodeExecutionStatus.Completed },
      { nodeId: 'trans', status: PipelineNodeExecutionStatus.Pending },
      { nodeId: 'video', status: PipelineNodeExecutionStatus.Pending },
    ];
    expect(areAllDependenciesMet('video', nodes, edges, terminal)).toBe(false);
    nodes[1]!.status = PipelineNodeExecutionStatus.Completed;
    expect(areAllDependenciesMet('video', nodes, edges, terminal)).toBe(true);
  });

  it('skipped parent satisfies fan-in', () => {
    const edges = [
      { from: 'image', to: 'video' },
      { from: 'trans', to: 'video' },
    ];
    const nodes = [
      { nodeId: 'image', status: PipelineNodeExecutionStatus.Completed },
      { nodeId: 'trans', status: PipelineNodeExecutionStatus.Skipped },
      { nodeId: 'video', status: PipelineNodeExecutionStatus.Pending },
    ];
    expect(areAllDependenciesMet('video', nodes, edges, terminal)).toBe(true);
  });

  it('linear fallback matches phase 1 chain', () => {
    const nodes = [
      { nodeId: 'a', order: 1, type: WorkflowNodeType.TextGeneration },
      { nodeId: 'b', order: 2, type: WorkflowNodeType.ImageGeneration },
    ];
    const edges = buildLinearEdgesFromOrder(nodes);
    expect(edges).toEqual([{ from: 'a', to: 'b' }]);
    expect(getRoots(nodes.map((n) => n.nodeId), edges)).toEqual(['a']);
  });

  it('detects terminal pipeline', () => {
    const nodes = [
      { nodeId: 'a', status: PipelineNodeExecutionStatus.Completed },
      { nodeId: 'b', status: PipelineNodeExecutionStatus.Skipped },
    ];
    const allTerminal = nodes.every(
      (n) =>
        n.status === PipelineNodeExecutionStatus.Completed ||
        n.status === PipelineNodeExecutionStatus.Skipped,
    );
    expect(allTerminal).toBe(true);
    expect(PipelineStatus.Running).toBe('running');
  });

  it('finds ready parallel lane nodes after text completes', () => {
    const edges = [
      { from: 'text', to: 'adapt_fb' },
      { from: 'text', to: 'adapt_ig' },
      { from: 'text', to: 'adapt_tw' },
      { from: 'adapt_fb', to: 'merge' },
      { from: 'adapt_ig', to: 'merge' },
      { from: 'adapt_tw', to: 'merge' },
    ];
    const nodes = [
      { nodeId: 'text', status: PipelineNodeExecutionStatus.Completed },
      { nodeId: 'adapt_fb', status: PipelineNodeExecutionStatus.Completed },
      { nodeId: 'adapt_ig', status: PipelineNodeExecutionStatus.Pending },
      { nodeId: 'adapt_tw', status: PipelineNodeExecutionStatus.Completed },
      { nodeId: 'merge', status: PipelineNodeExecutionStatus.Pending },
    ];
    const ready = nodes
      .filter((n) => n.status === PipelineNodeExecutionStatus.Pending)
      .filter((n) => areAllDependenciesMet(n.nodeId, nodes, edges, terminal))
      .map((n) => n.nodeId);
    expect(ready).toEqual(['adapt_ig']);
  });

  it('reconcile detects orphaned ready lane nodes (one lane completed, others stuck)', () => {
    const edges = [
      { from: 'text', to: 'adapt_fb' },
      { from: 'text', to: 'adapt_ig' },
      { from: 'text', to: 'adapt_tw' },
      { from: 'adapt_fb', to: 'merge' },
      { from: 'adapt_ig', to: 'merge' },
      { from: 'adapt_tw', to: 'merge' },
    ];
    const nodes = [
      { nodeId: 'text', status: PipelineNodeExecutionStatus.Completed },
      { nodeId: 'adapt_fb', status: PipelineNodeExecutionStatus.Completed },
      { nodeId: 'adapt_ig', status: PipelineNodeExecutionStatus.Pending },
      { nodeId: 'adapt_tw', status: PipelineNodeExecutionStatus.Pending },
      { nodeId: 'merge', status: PipelineNodeExecutionStatus.Pending },
    ];
    const hasReadyPending = nodes.some(
      (n) =>
        n.status === PipelineNodeExecutionStatus.Pending &&
        areAllDependenciesMet(n.nodeId, nodes, edges, terminal),
    );
    expect(hasReadyPending).toBe(true);
  });

  it('reconcile ignores pipelines whose pending nodes wait on a running dep', () => {
    const edges = [
      { from: 'text', to: 'image' },
      { from: 'image', to: 'video' },
    ];
    const nodes = [
      { nodeId: 'text', status: PipelineNodeExecutionStatus.Completed },
      { nodeId: 'image', status: PipelineNodeExecutionStatus.Running },
      { nodeId: 'video', status: PipelineNodeExecutionStatus.Pending },
    ];
    const hasReadyPending = nodes.some(
      (n) =>
        n.status === PipelineNodeExecutionStatus.Pending &&
        areAllDependenciesMet(n.nodeId, nodes, edges, terminal),
    );
    expect(hasReadyPending).toBe(false);
  });

  it('at pipeline start only enqueues nodes with satisfied dependencies', () => {
    const edges = [
      { from: 'text', to: 'adapt_fb' },
      { from: 'text', to: 'adapt_tw' },
      { from: 'adapt_fb', to: 'merge' },
      { from: 'adapt_tw', to: 'merge' },
    ];
    const nodes = [
      { nodeId: 'text', status: PipelineNodeExecutionStatus.Pending },
      { nodeId: 'adapt_fb', status: PipelineNodeExecutionStatus.Pending },
      { nodeId: 'adapt_tw', status: PipelineNodeExecutionStatus.Pending },
      { nodeId: 'merge', status: PipelineNodeExecutionStatus.Pending },
    ];
    const ready = nodes
      .filter((n) => n.status === PipelineNodeExecutionStatus.Pending)
      .filter((n) => areAllDependenciesMet(n.nodeId, nodes, edges, terminal))
      .map((n) => n.nodeId);
    expect(ready).toEqual(['text']);
  });
});
