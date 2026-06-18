import {
  defaultWorkflowNodeConfigForRule,
  parseWorkflowNodeConfigOrThrow,
} from '../nodes/workflow-node-config.zod';
import {
  NodeAspectRatio,
  WorkflowNodeType,
} from '../nodes/schemas/workflow-node.schema';

describe('defaultWorkflowNodeConfigForRule', () => {
  it('uses full video defaults with 9:16 when rule includes Instagram', () => {
    const config = defaultWorkflowNodeConfigForRule(
      WorkflowNodeType.VideoGeneration,
      { channels: [{ channel: 'instagram' }] },
    );
    expect(config.aspectRatio).toBe(NodeAspectRatio.R9x16);
    expect(config.mode).toBe('cinematic');
    expect(config.model).toBe('sora-2');
    expect(config.duration).toBe(8);
    expect(config.resolution).toBe('720p');
  });

  it('uses full image defaults from workflow schema', () => {
    const config = defaultWorkflowNodeConfigForRule(
      WorkflowNodeType.ImageGeneration,
      null,
    );
    expect(config.model).toBe('gpt-image-1');
    expect(config.style).toBe('natural');
    expect(config.aspectRatio).toBe('1:1');
    expect(config.quality).toBe('standard');
  });

  it('merges client overrides after rule defaults', () => {
    const base = defaultWorkflowNodeConfigForRule(
      WorkflowNodeType.VideoGeneration,
      { channels: [{ channel: 'instagram' }] },
    );
    const config = parseWorkflowNodeConfigOrThrow(
      WorkflowNodeType.VideoGeneration,
      {
        ...base,
        aspectRatio: '16:9',
      },
    );
    expect(config.aspectRatio).toBe('16:9');
  });
});
