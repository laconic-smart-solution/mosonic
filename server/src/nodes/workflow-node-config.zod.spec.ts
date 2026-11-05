import {
  NodeAspectRatio,
  NodeImageQuality,
  NodeImageTemplate,
  NodeOutputFormat,
  NodeSummaryLength,
  NodeTextTone,
  WorkflowNodeType,
} from './schemas/workflow-node.schema';
import {
  aspectRatioToOpenAiImageSize,
  coerceVideoConfigForPersist,
  parseWorkflowNodeConfig,
  rejectedVideoPatchKeys,
} from './workflow-node-config.zod';

describe('aspectRatioToOpenAiImageSize', () => {
  it('maps common presets for dall-e-3', () => {
    expect(aspectRatioToOpenAiImageSize('1:1', 'dall-e-3')).toBe('1024x1024');
    expect(aspectRatioToOpenAiImageSize('16:9', 'dall-e-3')).toBe('1792x1024');
    expect(aspectRatioToOpenAiImageSize('9:16', 'dall-e-3')).toBe('1024x1792');
    expect(aspectRatioToOpenAiImageSize('4:5', 'dall-e-3')).toBe('1024x1792');
  });

  it('maps common presets for gpt-image-1', () => {
    expect(aspectRatioToOpenAiImageSize('1:1', 'gpt-image-1')).toBe(
      '1024x1024',
    );
    expect(aspectRatioToOpenAiImageSize('16:9', 'gpt-image-1')).toBe(
      '1536x1024',
    );
    expect(aspectRatioToOpenAiImageSize('9:16', 'gpt-image-1')).toBe(
      '1024x1536',
    );
    expect(aspectRatioToOpenAiImageSize('4:5', 'gpt-image-1')).toBe(
      '1024x1536',
    );
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
    expect(r.data.size).toBe('1536x1024');
    expect(r.data.quality).toBe(NodeImageQuality.Hd);
  });

  it('coerces legacy DALL·E-3-only size when persisting gpt-image-2', () => {
    const r = parseWorkflowNodeConfig(WorkflowNodeType.ImageGeneration, {
      model: 'dall-e-3',
      size: '1792x1024',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.model).toBe('gpt-image-2');
    expect(r.data.size).toBe('1536x1024');
  });

  it('accepts template and channel on image_generation, defaulting template to auto', () => {
    const withTemplate = parseWorkflowNodeConfig(
      WorkflowNodeType.ImageGeneration,
      {
        template: 'product_mockup',
        channel: 'instagram',
      },
    );
    expect(withTemplate.ok).toBe(true);
    if (!withTemplate.ok) return;
    expect(withTemplate.data.template).toBe(NodeImageTemplate.ProductMockup);
    expect(withTemplate.data.channel).toBe('instagram');

    const withoutTemplate = parseWorkflowNodeConfig(
      WorkflowNodeType.ImageGeneration,
      {},
    );
    expect(withoutTemplate.ok).toBe(true);
    if (!withoutTemplate.ok) return;
    expect(withoutTemplate.data.template).toBe(NodeImageTemplate.Auto);
  });

  it('rejects an invalid template value for image_generation', () => {
    const r = parseWorkflowNodeConfig(WorkflowNodeType.ImageGeneration, {
      template: 'not-a-real-template',
    });
    expect(r.ok).toBe(false);
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

  it('preserves translation laneId for branch lane materialization', () => {
    const r = parseWorkflowNodeConfig(WorkflowNodeType.Translation, {
      laneId: 'linkedin',
      targetLanguage: 'es',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.data as Record<string, unknown>).laneId).toBe('linkedin');
    expect(r.data.targetLanguage).toBe('es');
  });

  it('parses video aspect 4:5', () => {
    const r = parseWorkflowNodeConfig(WorkflowNodeType.VideoGeneration, {
      aspectRatio: NodeAspectRatio.R4x5,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.aspectRatio).toBe('4:5');
  });

  it('snaps cinematic duration 12 to 10 seconds', () => {
    const r = parseWorkflowNodeConfig(WorkflowNodeType.VideoGeneration, {
      duration: 12,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.duration).toBe(10);
  });

  it('accepts explicit cinematic duration 15', () => {
    const r = parseWorkflowNodeConfig(WorkflowNodeType.VideoGeneration, {
      duration: 15,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.duration).toBe(15);
  });

  it('snaps presenter duration to allowed HeyGen values', () => {
    const r = parseWorkflowNodeConfig(WorkflowNodeType.VideoGeneration, {
      mode: 'presenter',
      heygenAvatarId: 'av-1',
      heygenVoiceId: 'voice-1',
      duration: 35,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.duration).toBe(30);
  });

  it('defaults video mode to cinematic', () => {
    const r = parseWorkflowNodeConfig(WorkflowNodeType.VideoGeneration, {});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.mode).toBe('cinematic');
  });

  it('allows presenter mode before avatar is chosen', () => {
    const r = parseWorkflowNodeConfig(WorkflowNodeType.VideoGeneration, {
      mode: 'presenter',
      heygenVoiceId: 'voice-1',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.mode).toBe('presenter');
    expect(r.data.heygenVoiceId).toBe('voice-1');
  });

  it('coerceVideoConfigForPersist keeps presenter mode when selecting presenter', () => {
    const coerced = coerceVideoConfigForPersist({
      mode: 'presenter',
      heygenVoiceId: 'voice-1',
    });
    expect(coerced.mode).toBe('presenter');
  });

  it('coerceVideoConfigForPersist falls back to cinematic when clearing avatar', () => {
    const coerced = coerceVideoConfigForPersist({
      mode: 'presenter',
      heygenVoiceId: 'voice-1',
      heygenAvatarId: '',
    });
    expect(coerced.mode).toBe('cinematic');
    expect(coerced.heygenAvatarId).toBe('');
  });

  it('accepts presenter config with avatar and voice', () => {
    const r = parseWorkflowNodeConfig(WorkflowNodeType.VideoGeneration, {
      mode: 'presenter',
      heygenAvatarId: 'avatar-1',
      heygenVoiceId: 'voice-1',
      heygenOrientation: 'portrait',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.mode).toBe('presenter');
    expect(r.data.heygenAvatarId).toBe('avatar-1');
  });

  it('fails summarization with invalid outputFormat', () => {
    const r = parseWorkflowNodeConfig(WorkflowNodeType.Summarization, {
      outputFormat: 'caption',
    });
    expect(r.ok).toBe(false);
  });

  it('defaults intelligence searchType to all', () => {
    const r = parseWorkflowNodeConfig(WorkflowNodeType.Intelligence, {});
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.data as Record<string, unknown>).searchType).toBe('all');
    expect((r.data as Record<string, unknown>).customPrompt).toBeNull();
  });

  it('requires customPrompt when intelligence searchType is custom', () => {
    const r = parseWorkflowNodeConfig(WorkflowNodeType.Intelligence, {
      searchType: 'custom',
    });
    expect(r.ok).toBe(false);
  });

  it('accepts intelligence custom search with prompt', () => {
    const r = parseWorkflowNodeConfig(WorkflowNodeType.Intelligence, {
      searchType: 'custom',
      customPrompt: 'Find competitor reels in skincare',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.data as Record<string, unknown>).searchType).toBe('custom');
    expect((r.data as Record<string, unknown>).customPrompt).toBe(
      'Find competitor reels in skincare',
    );
  });
});

describe('rejectedVideoPatchKeys', () => {
  it('accepts presenter keys on video_presenter, rejects cinematic-only and unknown', () => {
    expect(
      rejectedVideoPatchKeys(WorkflowNodeType.VideoPresenter, [
        'heygenVoiceId', 'heygenOrientation', 'heygenExpressiveness', 'heygenMotionPrompt',
        'heygenBackgroundUrl', 'removeBackground', 'resolution',
      ]),
    ).toEqual([]);
    expect(
      rejectedVideoPatchKeys(WorkflowNodeType.VideoPresenter, ['cinematicMode', 'bogus', 'heygenVoiceId']),
    ).toEqual(['cinematicMode', 'bogus']);
  });

  it('rejects presenter-only keys on video_cinematic; ignores non-video types', () => {
    expect(rejectedVideoPatchKeys(WorkflowNodeType.VideoCinematic, ['heygenVoiceId', 'cinematicMode'])).toEqual(['heygenVoiceId']);
    expect(rejectedVideoPatchKeys(WorkflowNodeType.ImageGeneration, ['whatever'])).toEqual([]);
  });
});
