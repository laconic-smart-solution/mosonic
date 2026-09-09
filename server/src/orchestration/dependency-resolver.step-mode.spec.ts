import { PipelineNodeExecutionStatus } from '../pipeline/schemas/pipeline.schema';
import { areAllDependenciesMet } from '../workflow/workflow-graph.util';

describe('dependency resolver step mode', () => {
  const terminal = new Set<string>([
    PipelineNodeExecutionStatus.Completed,
    PipelineNodeExecutionStatus.Skipped,
  ]);

  it('trunk waiting_review blocks lane node enqueue', () => {
    const edges = [
      { from: 'translation', to: 'adapt__instagram' },
      { from: 'translation', to: 'adapt__facebook' },
      { from: 'adapt__instagram', to: 'merge' },
      { from: 'adapt__facebook', to: 'merge' },
    ];
    const nodes = [
      {
        nodeId: 'translation',
        status: PipelineNodeExecutionStatus.WaitingReview,
      },
      {
        nodeId: 'adapt__instagram',
        status: PipelineNodeExecutionStatus.Pending,
      },
      {
        nodeId: 'adapt__facebook',
        status: PipelineNodeExecutionStatus.Pending,
      },
      { nodeId: 'merge', status: PipelineNodeExecutionStatus.Pending },
    ];

    expect(
      areAllDependenciesMet('adapt__instagram', nodes, edges, terminal),
    ).toBe(false);
    expect(
      areAllDependenciesMet('adapt__facebook', nodes, edges, terminal),
    ).toBe(false);
    expect(areAllDependenciesMet('merge', nodes, edges, terminal)).toBe(false);
  });

  it('parallel lanes are independent after trunk continues', () => {
    const edges = [
      { from: 'translation', to: 'adapt__instagram' },
      { from: 'translation', to: 'adapt__facebook' },
      { from: 'adapt__instagram', to: 'image__instagram' },
      { from: 'adapt__facebook', to: 'image__facebook' },
    ];
    const nodes = [
      { nodeId: 'translation', status: PipelineNodeExecutionStatus.Completed },
      {
        nodeId: 'adapt__instagram',
        status: PipelineNodeExecutionStatus.WaitingReview,
      },
      {
        nodeId: 'adapt__facebook',
        status: PipelineNodeExecutionStatus.Completed,
      },
      {
        nodeId: 'image__instagram',
        status: PipelineNodeExecutionStatus.Pending,
      },
      {
        nodeId: 'image__facebook',
        status: PipelineNodeExecutionStatus.Pending,
      },
    ];

    expect(
      areAllDependenciesMet('image__instagram', nodes, edges, terminal),
    ).toBe(false);
    expect(
      areAllDependenciesMet('image__facebook', nodes, edges, terminal),
    ).toBe(true);
  });

  it('waiting_review is not a terminal status', () => {
    expect(terminal.has(PipelineNodeExecutionStatus.WaitingReview)).toBe(false);
  });
});
