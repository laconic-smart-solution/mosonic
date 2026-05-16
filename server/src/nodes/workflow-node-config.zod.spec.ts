import {
  NodeAspectRatio,
  NodeImageQuality,
  NodeOutputFormat,
  NodeSummaryLength,
  NodeTextTone,
  WorkflowNodeType,
} from './schemas/workflow-node.schema';
import {
  aspectRatioToOpenAiImageSize,
  parseWorkflowNodeConfig,
} from './workflow-node-config.zod';

describe('aspectRatioToOpenAiImageSize', () => {
  it('maps common presets for dall-e-3', () => {
    expect(aspectRatioToOpenAiImageSize('1:1', 'dall-e-3')).toBe('1024x1024');
    expect(aspectRatioToOpenAiImageSize('16:9', 'dall-e-3')).toBe('1792x1024');
    expect(aspectRatioToOpenAiImageSize('9:16', 'dall-e-3')).toBe('1024x1792');
    expect(aspectRatioToOpenAiImageSize('4:5', 'dall-e-3')).toBe('1024x1792');
  });

  it('falls back to square for dall-e-2', () => {
    expect(aspectRatioToOpenAiImageSize('16:9', 'dall-e-2')).toBe('1024x1024');
  });
});

describe('parseWorkflowNodeConfig', () => {
  it('strips unknown keys and applies defaults for text_generation', () => {
    const r = parseWorkflowNodeConfig(WorkflowNodeType.TextGeneration, {
      model: 'gpt-4o',
      foo: 'bar',
      tone: 'witty',
      textLength: 'short',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.data as Record<string, unknown>).foo).toBeUndefined();
    expect(r.data.tone).toBe(NodeTextTone.Witty);
    expect(r.data.textLength).toBe(NodeSummaryLength.Short);
    expect(r.data.outputFormat).toBe(NodeOutputFormat.Paragraph);
  });

  it('rejects invalid enum values for text_generation', () => {
    const r = parseWorkflowNodeConfig(WorkflowNodeType.TextGeneration, {
      tone: 'not-a-real-tone',
      outputFormat: 'paragraph',
    });
    expect(r.ok).toBe(false);
  });

  it('maps image aspectRatio to size', () => {
    const r = parseWorkflowNodeConfig(WorkflowNodeType.ImageGeneration, {
      aspectRatio: '16:9',
      quality: 'hd',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.size).toBe('1792x1024');
    expect(r.data.quality).toBe(NodeImageQuality.Hd);
  });

  it('parses translation with auto source and preserveFormatting', () => {
    const r = parseWorkflowNodeConfig(WorkflowNodeType.Translation, {
      sourceLanguage: 'auto',
      targetLanguage: 'ja',
      preserveFormatting: false,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.sourceLanguage).toBe('auto');
    expect(r.data.targetLanguage).toBe('ja');
    expect(r.data.preserveFormatting).toBe(false);
  });

  it('parses video aspect 4:5', () => {
    const r = parseWorkflowNodeConfig(WorkflowNodeType.VideoGeneration, {
      aspectRatio: NodeAspectRatio.R4x5,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.aspectRatio).toBe('4:5');
  });

  it('snaps legacy video duration 15 to 16 seconds', () => {
    const r = parseWorkflowNodeConfig(WorkflowNodeType.VideoGeneration, {
      duration: 15,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.duration).toBe(16);
  });

  it('accepts explicit Sora duration 20', () => {
    const r = parseWorkflowNodeConfig(WorkflowNodeType.VideoGeneration, {
      duration: 20,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.duration).toBe(20);
  });

  it('fails summarization with invalid outputFormat', () => {
    const r = parseWorkflowNodeConfig(WorkflowNodeType.Summarization, {
      outputFormat: 'caption',
    });
    expect(r.ok).toBe(false);
  });
});
