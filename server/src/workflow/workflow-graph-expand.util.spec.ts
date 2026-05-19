import { WorkflowNodeType } from '../nodes/schemas/workflow-node.schema';
import {
  assignNodeIds,
  expandGraphLaneTemplates,
  type GraphNodeSpec,
} from './workflow-graph-expand.util';

function spec(
  partial: Omit<GraphNodeSpec, 'nodeId'> & { nodeId?: string },
): GraphNodeSpec {
  return {
    nodeId: partial.nodeId ?? `n-${partial.type}-${partial.order}`,
    type: partial.type,
    order: partial.order,
    isLocked: partial.isLocked ?? false,
    config: partial.config ?? {},
    lane: partial.lane ?? null,
  };
}

describe('expandGraphLaneTemplates', () => {
  it('passes through linear workflows', () => {
    const nodes = assignNodeIds([
      {
        type: WorkflowNodeType.KeywordPlanner,
        order: 1,
        isLocked: false,
        config: {},
      },
      {
        type: WorkflowNodeType.TextGeneration,
        order: 2,
        isLocked: false,
        config: {},
      },
    ]);
    const out = expandGraphLaneTemplates(nodes, ['instagram']);
    expect(out).toHaveLength(2);
  });

  it('expands shared adapt and image into per-channel nodes', () => {
    const nodes = assignNodeIds([
      { type: WorkflowNodeType.KeywordPlanner, order: 1, isLocked: false, config: {} },
      { type: WorkflowNodeType.TextGeneration, order: 2, isLocked: false, config: {} },
      {
        type: WorkflowNodeType.Branch,
        order: 3,
        isLocked: false,
        config: { mode: 'rule_channels' },
      },
      { type: WorkflowNodeType.Adapt, order: 4, isLocked: false, config: {} },
      {
        type: WorkflowNodeType.ImageGeneration,
        order: 5,
        isLocked: false,
        config: { aspectRatio: '1:1' },
      },
      {
        type: WorkflowNodeType.Merge,
        order: 6,
        isLocked: false,
        config: { strategy: 'collect_all' },
      },
    ]);
    const out = expandGraphLaneTemplates(nodes, ['instagram', 'linkedin']);
    expect(out.filter((n) => n.type === WorkflowNodeType.Adapt)).toHaveLength(2);
    expect(out.filter((n) => n.type === WorkflowNodeType.ImageGeneration)).toHaveLength(
      2,
    );
    const igAdapt = out.find(
      (n) => n.type === WorkflowNodeType.Adapt && n.lane === 'instagram',
    );
    expect(igAdapt?.config).toMatchObject({ laneId: 'instagram' });
    expect(out[out.length - 1]?.type).toBe(WorkflowNodeType.Merge);
  });
});
