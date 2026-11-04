/**
 * Deterministic preflight for video nodes, run BEFORE a video_generate job is
 * enqueued (and again at the top of the worker as defense-in-depth), so a
 * node missing its HeyGen setup fails cleanly instead of burning worker
 * attempts. Pure / Nest-free. Rules mirror the submit path in
 * VideoGenerationService (assertPresenterConfig, submitCinematicVideoJob) and
 * HeygenAssetsService.submitHeygenVideoModel; messages align with the chat
 * soft-gates in rule/tools/generate-more.tools.ts. Does not check the scene
 * prompt/script: that can come from upstream outputs and is resolved at submit.
 */
import { isVideoNodeType, videoModeForNode } from './video-node-type.util';

export type VideoPreflightCode =
  | 'presenter_setup_required'
  | 'cinematic_avatar_required'
  | 'heygen_video_reference_required';

export type VideoPreflightResult =
  | { ok: true }
  | { ok: false; code: VideoPreflightCode; message: string; missing: string[] };

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.map(str).filter(Boolean) : [];
}

export function preflightVideoNode(
  type: unknown,
  config: unknown,
): VideoPreflightResult {
  if (!isVideoNodeType(type)) return { ok: true };
  const cfg =
    config && typeof config === 'object' && !Array.isArray(config)
      ? (config as Record<string, unknown>)
      : {};

  if (videoModeForNode(type, cfg) === 'presenter') {
    const missing: string[] = [];
    const labels: string[] = [];
    if (!str(cfg.heygenAvatarId)) {
      missing.push('heygenAvatarId');
      labels.push('avatar');
    }
    if (!str(cfg.heygenVoiceId)) {
      missing.push('heygenVoiceId');
      labels.push('voice');
    }
    if (missing.length) {
      return {
        ok: false,
        code: 'presenter_setup_required',
        message: `A presenter video needs a ${labels.join(' and ')}. Set them in chat (list_heygen_looks / set_video_node_look for the look, update_node_config for the voice) or in node settings, then try again.`,
        missing,
      };
    }
    return { ok: true };
  }

  if (str(cfg.cinematicMode) === 'heygen_video') {
    const mode = str(cfg.heygenVideoMode) || 'text_to_video';
    const imageUrl = str(cfg.heygenReferenceImageUrl);
    const refs = strList(cfg.heygenReferenceAssetIds);
    if (mode === 'image_to_video' && !imageUrl) {
      return {
        ok: false,
        code: 'heygen_video_reference_required',
        message:
          'HeyGen image_to_video needs a reference image (heygenReferenceImageUrl). Add one in node settings or switch heygenVideoMode to text_to_video.',
        missing: ['heygenReferenceImageUrl'],
      };
    }
    if (mode === 'reference_to_video' && !imageUrl && !refs.length) {
      return {
        ok: false,
        code: 'heygen_video_reference_required',
        message:
          'HeyGen reference_to_video needs at least one reference image or video. Add one in node settings or switch heygenVideoMode to text_to_video.',
        missing: ['heygenReferenceAssetIds'],
      };
    }
    return { ok: true };
  }

  // cinematic_avatar (default / unset)
  if (!str(cfg.heygenAvatarId) && !strList(cfg.heygenAvatarIds).length) {
    return {
      ok: false,
      code: 'cinematic_avatar_required',
      message:
        'Cinematic avatar mode requires a HeyGen look. Set one with list_heygen_looks / set_video_node_look (a brand portrait works), or switch cinematicMode to heygen_video for a scene without a look.',
      missing: ['heygenAvatarId'],
    };
  }
  return { ok: true };
}
