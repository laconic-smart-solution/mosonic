import { WorkflowNodeType } from '../nodes/schemas/workflow-node.schema';
import { PipelineUserExecutionMode } from '../pipeline/schemas/pipeline.schema';
import type { PipelineRecord } from '../domain/pipeline/pipeline.types';
import {
  resolveTemplateNodeId,
  shouldPauseNodeForReview,
  validateAndNormalizeReviewNodeIds,
} from './pipeline-node-review-eligibility.util';

function mockPipeline(
  overrides: Partial<PipelineRecord> = {},
): PipelineRecord {
  return {
    pipelineId: 'p1',
    userId: 'u1',
    ruleRef: 'r1',
    executionMode: PipelineUserExecutionMode.Auto,
    metadata: { source: 'manual' },
    ...overrides,
  } as PipelineRecord;
}

describe('pipeline-node-review-eligibility.util', () => {
  describe('resolveTemplateNodeId', () => {
    it('returns trunk node id unchanged', () => {
      expect(resolveTemplateNodeId('text-1')).toBe('text-1');
    });

    it('strips lane suffix from materialized node id', () => {
      expect(resolveTemplateNodeId('img-1__facebook')).toBe('img-1');
    });
  });

  describe('shouldPauseNodeForReview', () => {
    it('returns false in auto mode', () => {
      expect(
        shouldPauseNodeForReview(
          mockPipeline({ executionMode: PipelineUserExecutionMode.Auto }),
          'text-1',
          WorkflowNodeType.TextGeneration,
        ),
      ).toBe(false);
    });

    it('returns true for all reviewable nodes in legacy step mode', () => {
      expect(
        shouldPauseNodeForReview(
          mockPipeline({
            executionMode: PipelineUserExecutionMode.Step,
            metadata: { source: 'manual' },
          }),
          'text-1',
          WorkflowNodeType.TextGeneration,
        ),
      ).toBe(true);
    });

    it('returns false for merge in step mode', () => {
      expect(
        shouldPauseNodeForReview(
          mockPipeline({ executionMode: PipelineUserExecutionMode.Step }),
          'merge-1',
          WorkflowNodeType.Merge,
        ),
      ).toBe(false);
    });

    it('returns false for branch in step mode', () => {
      expect(
        shouldPauseNodeForReview(
          mockPipeline({ executionMode: PipelineUserExecutionMode.Step }),
          'branch-1',
          WorkflowNodeType.Branch,
        ),
      ).toBe(false);
    });

    it('pauses only selected template nodes in step mode', () => {
      const pipeline = mockPipeline({
        executionMode: PipelineUserExecutionMode.Step,
        metadata: {
          source: 'manual',
          reviewNodeIds: ['text-1', 'img-1'],
        },
      });

      expect(
        shouldPauseNodeForReview(
          pipeline,
          'text-1',
          WorkflowNodeType.TextGeneration,
        ),
      ).toBe(true);
      expect(
        shouldPauseNodeForReview(
          pipeline,
          'video-1',
          WorkflowNodeType.VideoGeneration,
        ),
      ).toBe(false);
    });

    it('pauses materialized lane node when template is selected', () => {
      const pipeline = mockPipeline({
        executionMode: PipelineUserExecutionMode.Step,
        metadata: {
          source: 'manual',
          reviewNodeIds: ['img-1'],
        },
      });

      expect(
        shouldPauseNodeForReview(
          pipeline,
          'img-1__instagram',
          WorkflowNodeType.ImageGeneration,
        ),
      ).toBe(true);
      expect(
        shouldPauseNodeForReview(
          pipeline,
          'text-1__instagram',
          WorkflowNodeType.TextGeneration,
        ),
      ).toBe(false);
    });

    it('returns false when reviewNodeIds is an explicit empty array', () => {
      expect(
        shouldPauseNodeForReview(
          mockPipeline({
            executionMode: PipelineUserExecutionMode.Step,
            metadata: { source: 'manual', reviewNodeIds: [] },
          }),
          'text-1',
          WorkflowNodeType.TextGeneration,
        ),
      ).toBe(false);
    });
  });

  describe('validateAndNormalizeReviewNodeIds', () => {
    const workflowNodes = [
      { nodeId: 'text-1', type: WorkflowNodeType.TextGeneration },
      { nodeId: 'merge-1', type: WorkflowNodeType.Merge },
    ];

    it('returns undefined for auto mode', () => {
      expect(
        validateAndNormalizeReviewNodeIds({
          executionMode: 'auto',
          reviewNodeIds: ['text-1'],
          workflowNodes,
        }),
      ).toBeUndefined();
    });

    it('returns undefined when step mode omits reviewNodeIds', () => {
      expect(
        validateAndNormalizeReviewNodeIds({
          executionMode: 'step',
          workflowNodes,
        }),
      ).toBeUndefined();
    });

    it('normalizes and dedupes review node ids', () => {
      expect(
        validateAndNormalizeReviewNodeIds({
          executionMode: 'step',
          reviewNodeIds: ['text-1', ' text-1 '],
          workflowNodes,
        }),
      ).toEqual(['text-1']);
    });

    it('throws for unknown node id', () => {
      expect(() =>
        validateAndNormalizeReviewNodeIds({
          executionMode: 'step',
          reviewNodeIds: ['missing'],
          workflowNodes,
        }),
      ).toThrow('Unknown review node');
    });

    it('throws for non-reviewable node type', () => {
      expect(() =>
        validateAndNormalizeReviewNodeIds({
          executionMode: 'step',
          reviewNodeIds: ['merge-1'],
          workflowNodes,
        }),
      ).toThrow('not reviewable');
    });
  });
});
