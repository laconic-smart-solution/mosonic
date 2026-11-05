import { preflightVideoNode } from './video-node-preflight.util';
import { WorkflowNodeType } from './workflow-node-llm.enums';

describe('preflightVideoNode', () => {
  const C = WorkflowNodeType.VideoCinematic;
  const P = WorkflowNodeType.VideoPresenter;

  it('ignores non-video nodes', () => {
    expect(preflightVideoNode('text_generation', {})).toEqual({ ok: true });
  });

  it('fails cinematic_avatar (unset mode) without a look', () => {
    const r = preflightVideoNode(C, {});
    expect(r).toMatchObject({ ok: false, code: 'cinematic_avatar_required', missing: ['heygenAvatarId'] });
    if (!r.ok) expect(r.message).toMatch(/requires a HeyGen look/);
  });

  it('fails explicit cinematic_avatar with blank look ids', () => {
    expect(preflightVideoNode(C, { cinematicMode: 'cinematic_avatar', heygenAvatarId: '  ', heygenAvatarIds: ['', ' '] }).ok).toBe(false);
  });

  it('passes cinematic_avatar with heygenAvatarId or heygenAvatarIds', () => {
    expect(preflightVideoNode(C, { heygenAvatarId: 'look1' })).toEqual({ ok: true });
    expect(preflightVideoNode(C, { heygenAvatarIds: ['look2'] })).toEqual({ ok: true });
  });

  it('passes heygen_video text_to_video without a look', () => {
    expect(preflightVideoNode(C, { cinematicMode: 'heygen_video' })).toEqual({ ok: true });
  });

  it('heygen_video image/reference modes require refs like submit does', () => {
    expect(preflightVideoNode(C, { cinematicMode: 'heygen_video', heygenVideoMode: 'image_to_video' })).toMatchObject({ ok: false, code: 'heygen_video_reference_required' });
    expect(preflightVideoNode(C, { cinematicMode: 'heygen_video', heygenVideoMode: 'image_to_video', heygenReferenceImageUrl: 'https://x/y.png' })).toEqual({ ok: true });
    expect(preflightVideoNode(C, { cinematicMode: 'heygen_video', heygenVideoMode: 'reference_to_video' }).ok).toBe(false);
    expect(preflightVideoNode(C, { cinematicMode: 'heygen_video', heygenVideoMode: 'reference_to_video', heygenReferenceAssetIds: ['a1'] })).toEqual({ ok: true });
  });

  it('fails presenter missing voice', () => {
    const r = preflightVideoNode(P, { heygenAvatarId: 'av' });
    expect(r).toMatchObject({ ok: false, code: 'presenter_setup_required', missing: ['heygenVoiceId'] });
    if (!r.ok) expect(r.message).toMatch(/needs a voice/);
  });

  it('fails presenter missing both', () => {
    const r = preflightVideoNode(P, {});
    expect(r).toMatchObject({ ok: false, missing: ['heygenAvatarId', 'heygenVoiceId'] });
    if (!r.ok) expect(r.message).toMatch(/avatar and voice/);
  });

  it('passes complete presenter', () => {
    expect(preflightVideoNode(P, { heygenAvatarId: 'av', heygenVoiceId: 'v' })).toEqual({ ok: true });
  });

  it('legacy video_generation follows config.mode', () => {
    expect(preflightVideoNode(WorkflowNodeType.VideoGeneration, { mode: 'presenter' })).toMatchObject({ code: 'presenter_setup_required' });
    expect(preflightVideoNode(WorkflowNodeType.VideoGeneration, {})).toMatchObject({ code: 'cinematic_avatar_required' });
  });
});
