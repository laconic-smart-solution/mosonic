import { preflightVideoNode } from './video-node-preflight.util';
import {
  hydrateWorkflowNode,
  overlayTypedVideoConfig,
  typedVideoColumnsFromConfig,
} from './video-node-typed-config.util';

describe('video-node-typed-config.util', () => {
  it('derives typed columns from config JSON', () => {
    expect(
      typedVideoColumnsFromConfig({
        mode: 'cinematic',
        cinematicMode: 'cinematic_avatar',
        duration: 8.4,
        heygenAvatarId: ' look-1 ',
        heygenAvatarIds: ['look-1', '', 'b', 'c', 'd'],
        heygenLookSourceRuleAssetId: 'asset-1',
        prompt: 'ignored',
      }),
    ).toEqual({
      mode: 'cinematic',
      cinematicMode: 'cinematic_avatar',
      heygenVideoMode: null,
      duration: 8,
      aspectRatio: null,
      heygenVoiceId: null,
      heygenAvatarId: 'look-1',
      heygenAvatarIds: ['look-1', 'b', 'c'],
      heygenCinematicModel: null,
      sourceRuleAssetId: 'asset-1',
    });
  });

  it('typed look wins over stale JSON so preflight sees it', () => {
    const config = overlayTypedVideoConfig(
      { mode: 'presenter', heygenVoiceId: 'v' },
      {
        mode: null, cinematicMode: null, heygenVideoMode: null, duration: null,
        aspectRatio: null, heygenVoiceId: null, heygenAvatarId: 'typed',
        heygenAvatarIds: [], heygenCinematicModel: null,
      },
    );
    expect(config.heygenAvatarId).toBe('typed');
    expect(preflightVideoNode('video_presenter', config)).toEqual({ ok: true });
  });

  it('leaves non-video nodes untouched', () => {
    const node = hydrateWorkflowNode({ type: 'image_generation', config: { a: 1 }, videoConfig: null });
    expect(node).toEqual({ type: 'image_generation', config: { a: 1 } });
  });
});
