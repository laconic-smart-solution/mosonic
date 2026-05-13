import { BadRequestException } from '@nestjs/common';
import { WorkflowNodeType } from '../nodes/schemas/workflow-node.schema';

export type WorkflowOrderNode = {
  type: WorkflowNodeType;
  order: number;
  config?: Record<string, unknown>;
};

function summarizationSourceRef(
  config: Record<string, unknown> | undefined,
): string {
  const ref = config?.sourceNodeRef;
  return typeof ref === 'string' && ref.trim().length > 0
    ? ref.trim()
    : 'text_generation';
}

/**
 * Validates node counts and execution order for save / generated workflows.
 * Call with nodes already sorted by `order` ascending with sequential `order` 1..n.
 */
export function assertValidWorkflowNodeOrder(
  nodes: WorkflowOrderNode[],
): void {
  const sorted = [...nodes].sort((a, b) => a.order - b.order);
  const textNodes = sorted.filter(
    (n) => n.type === WorkflowNodeType.TextGeneration,
  );
  if (textNodes.length !== 1) {
    throw new BadRequestException(
      'Exactly one text_generation node is required',
    );
  }
  const plannerNodes = sorted.filter(
    (n) => n.type === WorkflowNodeType.KeywordPlanner,
  );
  if (plannerNodes.length !== 1) {
    throw new BadRequestException(
      'Exactly one keyword_planner node is required',
    );
  }
  const textOrder = textNodes[0]!.order;
  const plannerOrder = plannerNodes[0]!.order;
  if (plannerOrder >= textOrder) {
    throw new BadRequestException(
      'keyword_planner must run before text_generation (planner order must be less than writer order)',
    );
  }

  for (const n of sorted) {
    if (
      n.type === WorkflowNodeType.ImageGeneration ||
      n.type === WorkflowNodeType.Translation ||
      n.type === WorkflowNodeType.VideoGeneration
    ) {
      if (n.order <= textOrder) {
        throw new BadRequestException(
          `${n.type} must run after text_generation`,
        );
      }
    }
    if (n.type === WorkflowNodeType.Summarization) {
      const ref = summarizationSourceRef(n.config);
      if (ref === 'translation') {
        const hasTranslationBefore = sorted.some(
          (x) =>
            x.type === WorkflowNodeType.Translation &&
            x.order > textOrder &&
            x.order < n.order,
        );
        if (!hasTranslationBefore) {
          throw new BadRequestException(
            'Summarization with translation source requires a translation node after text_generation and before summarization',
          );
        }
      } else if (ref === 'transcription') {
        const hasTranscriptionBefore = sorted.some(
          (x) =>
            x.type === WorkflowNodeType.Transcription && x.order < n.order,
        );
        if (!hasTranscriptionBefore) {
          throw new BadRequestException(
            'Summarization with transcription source requires a transcription node before summarization',
          );
        }
      } else {
        if (textOrder >= n.order) {
          throw new BadRequestException(
            'Summarization must run after text_generation when summarizing text output',
          );
        }
      }
    }
  }
}
