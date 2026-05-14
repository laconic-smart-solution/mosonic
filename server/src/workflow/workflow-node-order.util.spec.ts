import { BadRequestException } from '@nestjs/common';
import { WorkflowNodeType } from '../nodes/schemas/workflow-node.schema';
import {
  assertValidWorkflowNodeOrder,
  type WorkflowOrderNode,
} from './workflow-node-order.util';

function expectBad(nodes: WorkflowOrderNode[]): void {
  expect(() => assertValidWorkflowNodeOrder(nodes)).toThrow(
    BadRequestException,
  );
}

describe('assertValidWorkflowNodeOrder', () => {
  it('accepts keyword_planner → text_generation → image', () => {
    assertValidWorkflowNodeOrder([
      { type: WorkflowNodeType.KeywordPlanner, order: 1 },
      { type: WorkflowNodeType.TextGeneration, order: 2 },
      { type: WorkflowNodeType.ImageGeneration, order: 3 },
    ]);
  });

  it('rejects missing keyword_planner', () => {
    expectBad([
      { type: WorkflowNodeType.TextGeneration, order: 1 },
      { type: WorkflowNodeType.ImageGeneration, order: 2 },
    ]);
  });

  it('rejects planner after text', () => {
    expectBad([
      { type: WorkflowNodeType.TextGeneration, order: 1 },
      { type: WorkflowNodeType.KeywordPlanner, order: 2 },
    ]);
  });

  it('rejects image before text', () => {
    expectBad([
      { type: WorkflowNodeType.KeywordPlanner, order: 1 },
      { type: WorkflowNodeType.ImageGeneration, order: 2 },
      { type: WorkflowNodeType.TextGeneration, order: 3 },
    ]);
  });

  it('rejects summarization before text when source is text', () => {
    expectBad([
      { type: WorkflowNodeType.KeywordPlanner, order: 1 },
      { type: WorkflowNodeType.Summarization, order: 2, config: {} },
      { type: WorkflowNodeType.TextGeneration, order: 3 },
    ]);
  });
});
