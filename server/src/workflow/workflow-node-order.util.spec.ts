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

  it('accepts image-only workflow without keyword or text', () => {
    assertValidWorkflowNodeOrder([
      { type: WorkflowNodeType.ImageGeneration, order: 1 },
    ]);
  });

  it('accepts multiple text_generation nodes', () => {
    assertValidWorkflowNodeOrder([
      { type: WorkflowNodeType.TextGeneration, order: 1 },
      { type: WorkflowNodeType.TextGeneration, order: 2 },
      { type: WorkflowNodeType.ImageGeneration, order: 3 },
    ]);
  });

  it('accepts intelligence before text', () => {
    assertValidWorkflowNodeOrder([
      { type: WorkflowNodeType.Intelligence, order: 1 },
      { type: WorkflowNodeType.TextGeneration, order: 2 },
    ]);
  });

  it('rejects intelligence after text in linear order', () => {
    expectBad([
      { type: WorkflowNodeType.TextGeneration, order: 1 },
      { type: WorkflowNodeType.Intelligence, order: 2 },
    ]);
  });

  it('rejects planner after text when both exist', () => {
    expectBad([
      { type: WorkflowNodeType.TextGeneration, order: 1 },
      { type: WorkflowNodeType.KeywordPlanner, order: 2 },
    ]);
  });

  it('rejects image before text when text exists', () => {
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
