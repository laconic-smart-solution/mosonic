import { BadRequestException } from '@nestjs/common';
import { WorkflowNodeType } from '../nodes/schemas/workflow-node.schema';
import { isVideoNodeType } from '../nodes/video-node-type.util';

const TEXT_NODE_TYPES = new Set<string>([
  WorkflowNodeType.TextGeneration,
  WorkflowNodeType.Translation,
  WorkflowNodeType.Summarization,
  WorkflowNodeType.Transcription,
  WorkflowNodeType.Subtitle,
  WorkflowNodeType.Adapt,
  WorkflowNodeType.KeywordPlanner,
  WorkflowNodeType.Intelligence,
]);

const MEDIA_NODE_TYPES = new Set<string>([
  WorkflowNodeType.ImageGeneration,
  WorkflowNodeType.VideoPresenter,
  WorkflowNodeType.VideoCinematic,
  WorkflowNodeType.VideoGeneration,
]);

export function isTextReviewNode(nodeType: string): boolean {
  return TEXT_NODE_TYPES.has(nodeType);
}

export function isMediaReviewNode(nodeType: string): boolean {
  return MEDIA_NODE_TYPES.has(nodeType);
}

export function buildEditedOutput(
  nodeType: string,
  editedContent?: string,
  mediaUrl?: string,
): Record<string, unknown> {
  if (isMediaReviewNode(nodeType)) {
    const url = mediaUrl?.trim();
    if (!url) {
      throw new BadRequestException(
        'mediaUrl is required for media node edits',
      );
    }
    if (nodeType === WorkflowNodeType.ImageGeneration) {
      return { image: url };
    }
    return { video: url };
  }

  const text = editedContent?.trim();
  if (!text) {
    throw new BadRequestException('editedContent must not be empty');
  }

  switch (nodeType) {
    case WorkflowNodeType.TextGeneration:
      return { text };
    case WorkflowNodeType.Translation:
      return { translatedText: text };
    case WorkflowNodeType.Summarization:
      return { summary: text };
    case WorkflowNodeType.Transcription:
      return { transcription: text };
    case WorkflowNodeType.Subtitle:
      return { subtitle: text };
    case WorkflowNodeType.Adapt:
    case WorkflowNodeType.Intelligence:
    case WorkflowNodeType.KeywordPlanner:
      try {
        return JSON.parse(text) as Record<string, unknown>;
      } catch {
        if (nodeType === WorkflowNodeType.KeywordPlanner) {
          return {
            keywords: text
              .split(/[\n,]+/)
              .map((k) => k.trim())
              .filter(Boolean),
          };
        }
        return { text };
      }
    default:
      return { text };
  }
}

export function extractReviewText(
  nodeType: string,
  output: Record<string, unknown>,
): string {
  switch (nodeType) {
    case WorkflowNodeType.TextGeneration:
      return String(output.text ?? '');
    case WorkflowNodeType.Translation:
      return String(output.translatedText ?? '');
    case WorkflowNodeType.Summarization:
      return String(output.summary ?? '');
    case WorkflowNodeType.Transcription:
      return String(output.transcription ?? '');
    case WorkflowNodeType.Subtitle:
      return String(output.subtitle ?? '');
    case WorkflowNodeType.Adapt:
    case WorkflowNodeType.Intelligence:
    case WorkflowNodeType.KeywordPlanner:
      return typeof output.text === 'string'
        ? output.text
        : JSON.stringify(output, null, 2);
    default:
      return '';
  }
}

export function extractReviewMediaUrl(
  nodeType: string,
  output: Record<string, unknown>,
): string | undefined {
  if (nodeType === WorkflowNodeType.ImageGeneration) {
    const v = output.image;
    return typeof v === 'string' ? v : undefined;
  }
  if (isVideoNodeType(nodeType)) {
    const v = output.video;
    return typeof v === 'string' ? v : undefined;
  }
  return undefined;
}
