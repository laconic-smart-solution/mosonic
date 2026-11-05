import {
  hydrateTypedWorkflowNode,
  overlayTypedConfig,
  TYPED_CONFIG_FAMILIES,
  typedColumnsFromConfig,
  typedFamilyForType,
} from './node-typed-config.util';
import { WorkflowNodeType } from './schemas/workflow-node.schema';

const fam = (name: string) => TYPED_CONFIG_FAMILIES.find((f) => f.name === name)!;

describe('node-typed-config.util', () => {
  it('maps every configurable non-video node type to a family', () => {
    const expected: Record<string, string> = {
      text_generation: 'text',
      keyword_planner: 'text',
      summarization: 'text',
      adapt: 'text',
      intelligence: 'text',
      translation: 'translation',
      image_generation: 'image',
      transcription: 'media',
      subtitle: 'media',
      branch: 'branch',
    };
    for (const [type, name] of Object.entries(expected)) {
      expect(typedFamilyForType(type)?.name).toBe(name);
    }
    for (const t of ['merge', 'video_presenter', 'video_cinematic', 'video_generation']) {
      expect(typedFamilyForType(t)).toBeNull();
    }
    // every enum value is either in a family, video, or merge
    for (const t of Object.values(WorkflowNodeType)) {
      const known = typedFamilyForType(t) || /video|merge/.test(String(t));
      expect(known).toBeTruthy();
    }
  });

  it('coerces JSON into typed columns (strings trimmed, numbers, bools, arrays)', () => {
    expect(
      typedColumnsFromConfig(fam('text'), {
        model: ' gpt-4o ',
        temperature: 0.7,
        maxTokens: 499.6,
        tone: '',
        customPrompt: null,
        junk: 'x',
      }),
    ).toEqual(
      expect.objectContaining({
        model: 'gpt-4o',
        temperature: 0.7,
        maxTokens: 500,
        tone: null,
        customPrompt: null,
      }),
    );
    expect(typedColumnsFromConfig(fam('translation'), { preserveFormatting: false }))
      .toEqual(expect.objectContaining({ preserveFormatting: false }));
    expect(typedColumnsFromConfig(fam('media'), { burnIn: 'yes', maxCharsPerLine: '42' }))
      .toEqual(expect.objectContaining({ burnIn: null, maxCharsPerLine: null }));
    expect(typedColumnsFromConfig(fam('branch'), { channels: ['ig', ' ', 3, 'fb '] }))
      .toEqual({ mode: null, channels: ['ig', 'fb'] });
  });

  it('typed wins over JSON; nulls / empty arrays fall back to JSON', () => {
    expect(
      overlayTypedConfig(
        fam('image'),
        { size: '1024x1024', quality: 'standard', extra: 1 },
        { size: '1024x1536', quality: null, aspectRatio: '9:16' },
      ),
    ).toEqual({ size: '1024x1536', quality: 'standard', aspectRatio: '9:16', extra: 1 });
    expect(
      overlayTypedConfig(fam('translation'), { preserveFormatting: true }, { preserveFormatting: false }),
    ).toEqual({ preserveFormatting: false });
    expect(
      overlayTypedConfig(fam('branch'), { channels: ['ig'] }, { channels: [], mode: 'wizard_channels' }),
    ).toEqual({ channels: ['ig'], mode: 'wizard_channels' });
  });

  it('missing typed row returns JSON unchanged', () => {
    expect(overlayTypedConfig(fam('text'), { model: 'a' }, null)).toEqual({ model: 'a' });
  });

  it('hydrate strips all relations and overlays only the matching family', () => {
    const node = hydrateTypedWorkflowNode({
      nodeId: 'n1',
      type: 'translation',
      config: { targetLanguage: 'th' },
      videoConfig: null,
      textConfig: { model: 'ignored' },
      translationConfig: { targetLanguage: 'en' },
      imageConfig: null,
      mediaConfig: null,
      branchConfig: null,
    });
    expect(node).toEqual({ nodeId: 'n1', type: 'translation', config: { targetLanguage: 'en' } });
  });

  it('hydrate still overlays video typed config', () => {
    const node = hydrateTypedWorkflowNode({
      type: 'video_presenter',
      config: { heygenVoiceId: 'v-json' },
      videoConfig: { heygenVoiceId: 'v-typed', heygenAvatarIds: [] } as never,
      textConfig: null,
    });
    expect(node).toEqual({ type: 'video_presenter', config: { heygenVoiceId: 'v-typed' } });
  });
});