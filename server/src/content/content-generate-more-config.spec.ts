import { parseWorkflowNodeConfigOrThrow } from '../nodes/workflow-node-config.zod';
import {
  NodeAspectRatio,
  WorkflowNodeType,
} from '../nodes/schemas/workflow-node.schema';

/** Mirrors `ContentService.defaultConfigForGenerateMore` for video + Instagram rule. */
function videoBaseForInstagramRule(): Record<string, unknown> {
  return {
    model: 'sora-2',
    duration: 15,
    resolution: '1080p',
    aspectRatio: NodeAspectRatio.R9x16,
  };
}

describe('generate-more node config merge', () => {
  it('keeps 9:16 video aspect when base matches Instagram-oriented defaults', () => {
    const config = parseWorkflowNodeConfigOrThrow(
      WorkflowNodeType.VideoGeneration,
      videoBaseForInstagramRule(),
    );
    expect(config.aspectRatio).toBe('9:16');
    expect(config.resolution).toBe('1080p');
  });

  it('allows client override of video aspect ratio to 16:9', () => {
    const config = parseWorkflowNodeConfigOrThrow(
      WorkflowNodeType.VideoGeneration,
      {
        ...videoBaseForInstagramRule(),
        aspectRatio: '16:9',
      },
    );
    expect(config.aspectRatio).toBe('16:9');
  });

  it('merges partial image config with schema defaults', () => {
    const config = parseWorkflowNodeConfigOrThrow(
      WorkflowNodeType.ImageGeneration,
      { model: 'gpt-image-1', aspectRatio: '4:5', style: 'vivid' },
    );
    expect(config.aspectRatio).toBe('4:5');
    expect(config.style).toBe('vivid');
    expect(config.model).toBe('gpt-image-1');
  });
});
