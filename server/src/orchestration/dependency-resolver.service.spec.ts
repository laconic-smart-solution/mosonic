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
});
