import { BadRequestException } from '@nestjs/common';
import { WorkflowNodeType } from '../nodes/schemas/workflow-node.schema';
import type { GraphNodeSpec } from './workflow-graph-expand.util';
import {
  assertEdgesRespectMatrix,
  buildWorkflowEdges,
} from './workflow-graph-edge-builder.util';

function spec(
  partial: Omit<GraphNodeSpec, 'nodeId'> & { nodeId?: string },
): GraphNodeSpec {
  return {
    nodeId: partial.nodeId ?? `${partial.type}-${partial.order}`,
    type: partial.type,
    order: partial.order,
    isLocked: partial.isLocked ?? false,
    config: partial.config ?? {},
    lane: partial.lane ?? null,
  };
}

describe('buildWorkflowEdges', () => {
  it('chains linear workflows by order', () => {
    const nodes = [
      spec({ nodeId: 'kw', type: WorkflowNodeType.KeywordPlanner, order: 1 }),
      spec({ nodeId: 'text', type: WorkflowNodeType.TextGeneration, order: 2 }),
      spec({ nodeId: 'img', type: WorkflowNodeType.ImageGeneration, order: 3 }),
    ];
    const edges = buildWorkflowEdges(nodes);
    expect(edges).toEqual([
      { from: 'kw', to: 'text' },
      { from: 'text', to: 'img' },
    ]);
  });

  it('wires graph workflows with branch handles per lane', () => {
    const nodes = [
      spec({ nodeId: 'kw', type: WorkflowNodeType.KeywordPlanner, order: 1 }),
      spec({ nodeId: 'text', type: WorkflowNodeType.TextGeneration, order: 2 }),
      spec({ nodeId: 'branch', type: WorkflowNodeType.Branch, order: 3 }),
      spec({
        nodeId: 'adapt_ig',
        type: WorkflowNodeType.Adapt,
        order: 4,
        lane: 'instagram',
        config: { laneId: 'instagram' },
      }),
      spec({
        nodeId: 'img_ig',
        type: WorkflowNodeType.ImageGeneration,
        order: 5,
        lane: 'instagram',
        config: { laneId: 'instagram' },
      }),
      spec({
        nodeId: 'adapt_li',
        type: WorkflowNodeType.Adapt,
        order: 6,
        lane: 'linkedin',
        config: { laneId: 'linkedin' },
      }),
      spec({
        nodeId: 'img_li',
        type: WorkflowNodeType.ImageGeneration,
        order: 7,
        lane: 'linkedin',
        config: { laneId: 'linkedin' },
      }),
      spec({ nodeId: 'merge', type: WorkflowNodeType.Merge, order: 8 }),
    ];
    const edges = buildWorkflowEdges(nodes);
    expect(edges).toContainEqual({
      from: 'branch',
      to: 'adapt_ig',
      sourceHandle: 'instagram',
    });
    expect(edges).toContainEqual({ from: 'adapt_ig', to: 'img_ig' });
    expect(edges).toContainEqual({
      from: 'img_ig',
      to: 'merge',
      targetHandle: 'instagram',
    });
    expect(edges).toContainEqual({
      from: 'branch',
      to: 'adapt_li',
      sourceHandle: 'linkedin',
    });
    expect(edges).toContainEqual({ from: 'adapt_li', to: 'img_li' });
    expect(edges).toContainEqual({
      from: 'img_li',
      to: 'merge',
      targetHandle: 'linkedin',
    });
  });

  it('chains multiple image_generation nodes in a lane', () => {
    const nodes = [
      spec({ nodeId: 'text', type: WorkflowNodeType.TextGeneration, order: 1 }),
      spec({ nodeId: 'branch', type: WorkflowNodeType.Branch, order: 2 }),
      spec({
        nodeId: 'adapt_ig',
        type: WorkflowNodeType.Adapt,
        order: 3,
        lane: 'instagram',
        config: { laneId: 'instagram' },
      }),
      spec({
        nodeId: 'img_ig_1',
        type: WorkflowNodeType.ImageGeneration,
        order: 4,
        lane: 'instagram',
        config: { laneId: 'instagram' },
      }),
      spec({
        nodeId: 'img_ig_2',
        type: WorkflowNodeType.ImageGeneration,
        order: 5,
        lane: 'instagram',
        config: { laneId: 'instagram' },
      }),
      spec({ nodeId: 'merge', type: WorkflowNodeType.Merge, order: 6 }),
    ];
    const edges = buildWorkflowEdges(nodes);
    expect(edges).toContainEqual({ from: 'img_ig_1', to: 'img_ig_2' });
    expect(edges).toContainEqual({
      from: 'img_ig_2',
      to: 'merge',
      targetHandle: 'instagram',
    });
  });

  it('chains multiple summarization nodes in a lane', () => {
    const nodes = [
      spec({ nodeId: 'text', type: WorkflowNodeType.TextGeneration, order: 1 }),
      spec({ nodeId: 'branch', type: WorkflowNodeType.Branch, order: 2 }),
      spec({
        nodeId: 'adapt_ig',
        type: WorkflowNodeType.Adapt,
        order: 3,
        lane: 'instagram',
        config: { laneId: 'instagram' },
      }),
      spec({
        nodeId: 'sum_1',
        type: WorkflowNodeType.Summarization,
        order: 4,
        lane: 'instagram',
        config: { laneId: 'instagram' },
      }),
      spec({
        nodeId: 'sum_2',
        type: WorkflowNodeType.Summarization,
        order: 5,
        lane: 'instagram',
        config: { laneId: 'instagram' },
      }),
      spec({ nodeId: 'merge', type: WorkflowNodeType.Merge, order: 6 }),
    ];
    const edges = buildWorkflowEdges(nodes);
    expect(edges).toContainEqual({ from: 'sum_1', to: 'sum_2' });
  });

  it('chains multiple image_generation nodes on linear trunk', () => {
    const nodes = [
      spec({ nodeId: 'text', type: WorkflowNodeType.TextGeneration, order: 1 }),
      spec({
        nodeId: 'img_1',
        type: WorkflowNodeType.ImageGeneration,
        order: 2,
      }),
      spec({
        nodeId: 'img_2',
        type: WorkflowNodeType.ImageGeneration,
        order: 3,
      }),
    ];
    const edges = buildWorkflowEdges(nodes);
    expect(edges).toEqual([
      { from: 'text', to: 'img_1' },
      { from: 'img_1', to: 'img_2' },
    ]);
  });

  it('rejects matrix-invalid linear edges', () => {
    const nodes = [
      spec({ nodeId: 'img', type: WorkflowNodeType.ImageGeneration, order: 1 }),
      spec({ nodeId: 'kw', type: WorkflowNodeType.KeywordPlanner, order: 2 }),
    ];
    expect(() => buildWorkflowEdges(nodes)).toThrow(BadRequestException);
  });
});

describe('assertEdgesRespectMatrix', () => {
  it('passes for valid edges', () => {
    const nodes = [
      { nodeId: 'a', type: WorkflowNodeType.KeywordPlanner },
      { nodeId: 'b', type: WorkflowNodeType.TextGeneration },
    ];
    expect(() =>
      assertEdgesRespectMatrix(nodes, [{ from: 'a', to: 'b' }]),
    ).not.toThrow();
  });
});
