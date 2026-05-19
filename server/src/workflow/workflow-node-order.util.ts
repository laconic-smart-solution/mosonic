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
 * Validates linear node order for save / generated workflows (when edges are absent).
 * Graph connectivity and cycles are validated separately via validateWorkflowGraph.
 */
export function assertValidWorkflowNodeOrder(
  nodes: WorkflowOrderNode[],
): void {
  const sorted = [...nodes].sort((a, b) => a.order - b.order);
  const textNodes = sorted.filter(
    (n) => n.type === WorkflowNodeType.TextGeneration,
  );
  const plannerNodes = sorted.filter(
    (n) => n.type === WorkflowNodeType.KeywordPlanner,
  );

  if (plannerNodes.length > 0 && textNodes.length > 0) {
    const maxPlannerOrder = Math.max(...plannerNodes.map((n) => n.order));
    const minTextOrder = Math.min(...textNodes.map((n) => n.order));
    if (maxPlannerOrder >= minTextOrder) {
      throw new BadRequestException(
        'keyword_planner must run before text_generation (planner order must be less than writer order)',
      );
    }
  }

  const intelligenceNodes = sorted.filter(
    (n) => n.type === WorkflowNodeType.Intelligence,
  );
  if (textNodes.length > 0 && intelligenceNodes.length > 0) {
    const maxIntelOrder = Math.max(...intelligenceNodes.map((n) => n.order));
    const minTextOrder = Math.min(...textNodes.map((n) => n.order));
    if (maxIntelOrder >= minTextOrder) {
      throw new BadRequestException(
        'intelligence must run before text_generation (intelligence order must be less than writer order)',
      );
    }
  }

  if (textNodes.length === 0) {
    return;
  }

  const maxTextOrder = Math.max(...textNodes.map((n) => n.order));

  for (const n of sorted) {
    if (
      n.type === WorkflowNodeType.Branch ||
      n.type === WorkflowNodeType.Merge ||
      n.type === WorkflowNodeType.Adapt
    ) {
      if (n.order <= maxTextOrder) {
        throw new BadRequestException(
          `${n.type} must run after text_generation`,
        );
      }
      continue;
    }
    if (
      n.type === WorkflowNodeType.ImageGeneration ||
      n.type === WorkflowNodeType.Translation ||
      n.type === WorkflowNodeType.VideoGeneration
    ) {
      if (n.order <= maxTextOrder) {
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
            x.order > maxTextOrder &&
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
      } else if (maxTextOrder >= n.order) {
        throw new BadRequestException(
          'Summarization must run after text_generation when summarizing text output',
        );
      }
    }
  }
}
