import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { TenancyAuth } from '../../auth/tenancy.types';
import type { ContentService } from '../../content/content.service';
import { WorkflowNodeType } from '../../nodes/schemas/workflow-node.schema';
import type { IContentRepository } from '../../repositories/interfaces/content.repository.interface';
import { DISTRIBUTION_CHANNELS } from '../../workflow/distribution-channels.util';
import type { WorkflowService } from '../../workflow/workflow.service';
import { runTool, toolError } from './tool-error.util';
import { isVideoNodeType } from '../../nodes/video-node-type.util';
import {
  assertContentEditable,
  previewFromRecord,
  resolveContentForSession,
  showContentPayload,
} from './content-scope.util';

const LANES = DISTRIBUTION_CHANNELS.map((channel) => channel.id) as [
  string,
  ...string[],
];

type GenerateMoreDeps = {
  ruleId: string;
  workflowService: WorkflowService;
  contents: IContentRepository;
  contentService: ContentService;
  auth: TenancyAuth;
};

async function runGenerateMore(
  deps: GenerateMoreDeps,
  args: {
    type: WorkflowNodeType;
    message?: string;
    config?: Record<string, unknown>;
    contentId?: string;
    workflowId?: string;
  },
): Promise<string> {
  const scoped = await resolveContentForSession(
    deps.workflowService,
    deps.contents,
    deps.ruleId,
    deps.auth,
    { contentId: args.contentId, workflowId: args.workflowId },
  );
  if (!scoped.ok) return scoped.observation;
  const locked = assertContentEditable(String(scoped.content.status));
  if (locked) return locked;

  const result = await deps.contentService.scheduleGenerateNode(
    scoped.content.contentId,
    {
      type: args.type,
      message: args.message?.trim() || undefined,
      config: args.config,
    },
    deps.auth,
  );
  if (!result?.nodeId) {
    return toolError('generate_more_not_started', 'Nothing was started: the run did not return a step. Tell the user it did not start and offer to try again.');
  }
  const isVideo = isVideoNodeType(args.type);
  const status = String(scoped.content.status);
  return showContentPayload(previewFromRecord(scoped.content), {
    action: 'generate_more_started',
    pendingNodeId: result.nodeId,
    pendingNodeType: args.type,
    // Outcome honesty: this only queued the step; nothing new exists yet.
    mediaReady: false,
    outcome: 'started_not_done',
    contentStatus: status,
    next: isVideo
      ? `Only queued: the video is NOT ready and takes several minutes${status === 'approved' ? ' (it is added to this approved post)' : ''}. Say it started and will appear on the post when done; never say it is ready. If it fails it shows as failed in get_draft_media_status - check that before claiming it worked.`
      : 'Only queued: the new media/text is NOT ready yet. Say it started; never describe it as done or ready until get_draft_media_status (or the draft) shows it.',
  });
}

const IMAGE_SCHEMA = z.object({
  message: z
    .string()
    .max(2000)
    .optional()
    .describe('Direction for this extra image, e.g. minimalist product shot.'),
  lane: z
    .enum(LANES)
    .optional()
    .describe('Channel for this extra image: instagram, facebook, linkedin, tiktok, youtube, rednote.'),
  aspectRatio: z.enum(['1:1', '16:9', '9:16', '4:5']).optional(),
  style: z.enum(['natural', 'vivid']).optional(),
  quality: z.enum(['standard', 'hd']).optional(),
  contentId: z.string().optional(),
  workflowId: z.string().optional(),
});

export function createGenerateMoreImageTool(deps: GenerateMoreDeps) {
  return tool(
    async ({ message, lane, aspectRatio, style, quality, contentId, workflowId }) =>
      runTool(async () => {
        const config: Record<string, unknown> = {};
        if (lane) {
          config.laneId = lane;
          config.channel = lane;
        }
        if (aspectRatio) config.aspectRatio = aspectRatio;
        if (style) config.style = style;
        if (quality) config.quality = quality;
        return runGenerateMore(deps, {
          type: WorkflowNodeType.ImageGeneration,
          message,
          config: Object.keys(config).length ? config : undefined,
          contentId,
          workflowId,
        });
      }),
    {
      name: 'generate_more_image',
      description:
        'Add another image on an existing draft for this brand workflow (Generate more). Does not change the saved workflow template. Not a full pipeline. Image or style request ("watercolor") while Live state has a Latest post: call this for that post first with the style in the message, then offer ONE ask_user chip "Use <style> for future posts too" (Yes: add the image step with that style, or remember it if one exists). Not for putting the logo on the photo (rerun_content_node). For a video use generate_presenter_video (HeyGen avatar talking) or generate_cinematic_video (HeyGen cinematic_avatar / heygen_video). May run in the same turn after generate_more_adapt when the user also asked for an image.',
      schema: IMAGE_SCHEMA,
    },
  );
}

const TRANSLATION_SCHEMA = z.object({
  message: z
    .string()
    .max(2000)
    .optional()
    .describe('Optional extra instruction, e.g. keep a formal tone.'),
  targetLanguage: z
    .string()
    .min(2)
    .max(32)
    .optional()
    .describe('Target language code such as th or en.'),
  formalityLevel: z.enum(['formal', 'casual']).optional(),
  contentId: z.string().optional(),
  workflowId: z.string().optional(),
});

export function createGenerateMoreTranslationTool(deps: GenerateMoreDeps) {
  return tool(
    async ({ message, targetLanguage, formalityLevel, contentId, workflowId }) =>
      runTool(async () => {
        if (!message?.trim() && !targetLanguage?.trim()) {
          return toolError(
            'empty_patch',
            'Pass targetLanguage (e.g. th) and/or a message describing the translation.',
          );
        }
        const config: Record<string, unknown> = {};
        if (targetLanguage?.trim()) config.targetLanguage = targetLanguage.trim();
        if (formalityLevel) config.formalityLevel = formalityLevel;
        return runGenerateMore(deps, {
          type: WorkflowNodeType.Translation,
          message,
          config: Object.keys(config).length ? config : undefined,
          contentId,
          workflowId,
        });
      }),
    {
      name: 'generate_more_translation',
      description:
        'Add another translation on an existing draft for this brand workflow (Generate more). Does not start a new pipeline.',
      schema: TRANSLATION_SCHEMA,
    },
  );
}

const SUMMARY_SCHEMA = z.object({
  message: z
    .string()
    .max(2000)
    .optional()
    .describe('Optional direction for the extra summary.'),
  summaryLength: z.enum(['short', 'medium', 'long']).optional(),
  contentId: z.string().optional(),
  workflowId: z.string().optional(),
});

const ADAPT_SCHEMA = z.object({
  lane: z
    .enum(LANES)
    .describe('Channel to add on this draft: instagram, facebook, linkedin, tiktok, youtube, rednote.'),
  message: z
    .string()
    .max(2000)
    .optional()
    .describe('Optional direction for this channel caption, e.g. shorter and more casual.'),
  contentId: z.string().optional(),
  workflowId: z.string().optional(),
});

export function createGenerateMoreAdaptTool(deps: GenerateMoreDeps) {
  return tool(
    async ({ lane, message, contentId, workflowId }) =>
      runTool(async () => {
        const scoped = await resolveContentForSession(
          deps.workflowService,
          deps.contents,
          deps.ruleId,
          deps.auth,
          { contentId, workflowId },
        );
        if (!scoped.ok) return scoped.observation;
        const locked = assertContentEditable(String(scoped.content.status));
        if (locked) return locked;

        const catalog = await deps.contentService.describeDraftNodes(
          scoped.content.contentId,
          deps.auth,
        );
        if (catalog.lanes.map((id) => id.toLowerCase()).includes(lane)) {
          await deps.contentService
            .syncUploadLane(scoped.content.contentId, lane, deps.auth)
            .catch(() => undefined);
          return toolError(
            'lane_taken',
            `This draft already has a ${lane} caption. Use rerun_content_node to change it.`,
            { lane },
          );
        }

        return runGenerateMore(deps, {
          type: WorkflowNodeType.Adapt,
          message,
          config: { laneId: lane, channel: lane },
          contentId: scoped.content.contentId,
          workflowId,
        });
      }),
    {
      name: 'generate_more_adapt',
      description:
        'Add another channel caption on an existing draft (Generate more Adapt). Use when the user wants THIS post also on TikTok / Instagram / LinkedIn / Facebook / YouTube / RedNote ("add TikTok", "post for Instagram too", "also LinkedIn") and Live state has a Latest post - call it this turn. Required lane (e.g. tiktok). Does not change the saved workflow template - never use set_workflow_channels, update_rule or start_generation for this. If they also want a new image for that channel, call generate_more_image with the same lane (or rerun_content_node) in the same turn after this.',
      schema: ADAPT_SCHEMA,
    },
  );
}

export function createGenerateMoreSummaryTool(deps: GenerateMoreDeps) {
  return tool(
    async ({ message, summaryLength, contentId, workflowId }) =>
      runTool(async () => {
        const config: Record<string, unknown> = {};
        if (summaryLength) config.summaryLength = summaryLength;
        return runGenerateMore(deps, {
          type: WorkflowNodeType.Summarization,
          message,
          config: Object.keys(config).length ? config : undefined,
          contentId,
          workflowId,
        });
      }),
    {
      name: 'generate_more_summary',
      description:
        'Add another summary on an existing draft for this brand workflow (Generate more). Does not start a new pipeline.',
      schema: SUMMARY_SCHEMA,
    },
  );
}

/** HeyGen settings copied from the brand workflow's Presenter step when the call omits them. */
const PRESENTER_COPY_KEYS = [
  'heygenAvatarId',
  'heygenAvatarAssetId',
  'heygenAvatarPhotoUrl',
  'heygenVoiceId',
  'heygenBackgroundAssetId',
  'heygenBackgroundUrl',
  'heygenExpressiveness',
  'heygenMotionPrompt',
  'removeBackground',
] as const;

async function workflowPresenterConfig(
  deps: GenerateMoreDeps,
): Promise<Record<string, unknown>> {
  const snapshot = await deps.workflowService
    .getWorkflowByRuleId(deps.ruleId, deps.auth)
    .catch(() => null);
  const nodes = (snapshot?.nodes ?? []) as Array<{ type?: unknown; config?: unknown }>;
  const pick = (
    pred: (n: { type?: unknown; config?: unknown }) => boolean,
  ): Record<string, unknown> => {
    const hit = nodes.find((n) => isVideoNodeType(n.type) && pred(n));
    const cfg = (hit?.config ?? {}) as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of PRESENTER_COPY_KEYS) {
      if (cfg[key] !== undefined && cfg[key] !== '') out[key] = cfg[key];
    }
    // Cinematic-only fields (not in PRESENTER_COPY_KEYS).
    for (const key of [
      'cinematicMode',
      'heygenVideoMode',
      'heygenAvatarIds',
      'heygenCinematicModel',
      'heygenReferenceAssetIds',
      'heygenReferenceImageUrl',
      'enhancePrompt',
      'promptEnhancement',
      'seed',
    ] as const) {
      if (cfg[key] !== undefined && cfg[key] !== '') out[key] = cfg[key];
    }
    return out;
  };
  // Prefer dedicated cinematic node, then presenter / any look-bearing video node.
  const cinematic = pick(
    (n) =>
      n.type === WorkflowNodeType.VideoCinematic ||
      (n.config as { mode?: string } | undefined)?.mode === 'cinematic',
  );
  if (Object.keys(cinematic).length) return cinematic;
  return pick((n) => {
    const cfg = (n.config ?? {}) as Record<string, unknown>;
    return (
      n.type === WorkflowNodeType.VideoPresenter ||
      cfg.mode === 'presenter' ||
      Boolean(String(cfg.heygenAvatarId ?? '').trim())
    );
  });
}

const VIDEO_COMMON = {
  message: z
    .string()
    .max(2000)
    .optional()
    .describe('Direction for this video, e.g. upbeat 15s product teaser.'),
  lane: z
    .enum(LANES)
    .optional()
    .describe('Channel for this video: instagram, facebook, linkedin, tiktok, youtube, rednote.'),
  contentId: z.string().optional(),
  workflowId: z.string().optional(),
};

const PRESENTER_SCHEMA = z.object({
  ...VIDEO_COMMON,
  duration: z
    .union([z.literal(10), z.literal(20), z.literal(30), z.literal(40), z.literal(60)])
    .optional()
    .describe('Target seconds (presenter): 10, 20, 30, 40 or 60.'),
  orientation: z.enum(['portrait', 'landscape']).optional(),
  heygenAvatarId: z.string().optional().describe('Only when the user picked a specific avatar.'),
  heygenVoiceId: z.string().optional().describe('Only when the user picked a specific voice.'),
});

const CINEMATIC_SCHEMA = z.object({
  ...VIDEO_COMMON,
  duration: z
    .union([z.literal(5), z.literal(10), z.literal(15)])
    .optional()
    .describe('Clip length in seconds (snaps to 5, 10, or 15).'),
  aspectRatio: z.string().optional().describe('e.g. 16:9 or 9:16.'),
  cinematicMode: z
    .enum(['cinematic_avatar', 'heygen_video'])
    .optional()
    .describe(
      'cinematic_avatar = HeyGen looks + prompt (default). heygen_video = text/image/reference to video without a talking-head script.',
    ),
  heygenVideoMode: z
    .enum(['text_to_video', 'image_to_video', 'reference_to_video'])
    .optional()
    .describe('Only for cinematicMode=heygen_video. Default text_to_video.'),
  heygenAvatarId: z
    .string()
    .optional()
    .describe('Look id for cinematic_avatar; omit to use workflow node config / ask user to upload.'),
});

function laneConfig(lane?: string): Record<string, unknown> {
  return lane ? { laneId: lane, channel: lane } : {};
}

/** Avatar + voice are required before HeyGen is called (expensive; never guess). */
export function presenterSetupMissing(config: Record<string, unknown>): string[] {
  const missing: string[] = [];
  if (!String(config.heygenAvatarId ?? '').trim()) missing.push('avatar');
  if (!String(config.heygenVoiceId ?? '').trim()) missing.push('voice');
  return missing;
}

export function createGeneratePresenterVideoTool(deps: GenerateMoreDeps) {
  return tool(
    async ({ message, lane, duration, orientation, heygenAvatarId, heygenVoiceId, contentId, workflowId }) =>
      runTool(async () => {
        const config: Record<string, unknown> = {
          ...(await workflowPresenterConfig(deps)),
          ...laneConfig(lane),
          mode: 'presenter',
        };
        if (heygenAvatarId?.trim()) config.heygenAvatarId = heygenAvatarId.trim();
        if (heygenVoiceId?.trim()) config.heygenVoiceId = heygenVoiceId.trim();
        if (duration) config.duration = duration;
        config.heygenOrientation = orientation ?? 'portrait';
        const missing = presenterSetupMissing(config);
        if (missing.length) {
          return toolError(
            'presenter_setup_required',
            `A presenter video needs a ${missing.join(' and ')}. Call list_heygen_looks, then set_video_node_look on the video_presenter node (lookId, or ruleAssetId to turn a brand portrait into a look) after ask_user; call list_heygen_voices, then update_node_config with config.heygenVoiceId on that node. Then try again. (Or pick them in the Presenter step on the canvas.)`,
            {
              missing,
              nextTools: [
                ...(missing.includes('avatar') ? ['list_heygen_looks', 'set_video_node_look'] : []),
                ...(missing.includes('voice') ? ['list_heygen_voices', 'update_node_config'] : []),
              ],
              canvasPath: `/workflow/${deps.ruleId}`,
            },
          );
        }
        return runGenerateMore(deps, {
          type: WorkflowNodeType.VideoPresenter,
          message,
          config,
          contentId,
          workflowId,
        });
      }),
    {
      name: 'generate_presenter_video',
      description:
        'Add a PRESENTER video (HeyGen avatar speaking the caption) to an existing draft (Generate more). Costs credits and takes minutes: only after the user confirmed via ask_user. Uses the avatar and voice from the workflow Presenter step; errors presenter_setup_required when either is missing: then list_heygen_looks + set_video_node_look for the look and list_heygen_voices + update_node_config (config.heygenVoiceId) for the voice on the video_presenter node, each after ask_user, and only then retry. Not for scenic/b-roll clips (generate_cinematic_video). Does not change the saved workflow (to add the step for future posts use add_workflow_node video_presenter).',
      schema: PRESENTER_SCHEMA,
    },
  );
}

export function createGenerateCinematicVideoTool(deps: GenerateMoreDeps) {
  return tool(
    async ({
      message,
      lane,
      duration,
      aspectRatio,
      cinematicMode,
      heygenVideoMode,
      heygenAvatarId,
      contentId,
      workflowId,
    }) =>
      runTool(async () => {
        const config: Record<string, unknown> = {
          ...laneConfig(lane),
          mode: 'cinematic',
          cinematicMode: cinematicMode ?? 'cinematic_avatar',
        };
        if (duration) config.duration = duration;
        if (aspectRatio) config.aspectRatio = aspectRatio;
        else if (lane === 'instagram' || lane === 'tiktok') config.aspectRatio = '9:16';
        if (heygenVideoMode) config.heygenVideoMode = heygenVideoMode;
        if (heygenAvatarId?.trim()) config.heygenAvatarId = heygenAvatarId.trim();
        const mode = String(config.cinematicMode);
        if (mode === 'cinematic_avatar') {
          const look =
            String(config.heygenAvatarId ?? '').trim() ||
            (Array.isArray(config.heygenAvatarIds) &&
              config.heygenAvatarIds.some((id) => String(id ?? '').trim()));
          // Prefer workflow Presenter/Cinematic look when tool omits avatar.
          if (!look) {
            const fromWf = await workflowPresenterConfig(deps);
            if (fromWf.heygenAvatarId) config.heygenAvatarId = fromWf.heygenAvatarId;
          }
          const stillMissing = !String(config.heygenAvatarId ?? '').trim();
          if (stillMissing) {
            return toolError(
              'cinematic_avatar_required',
              'Cinematic avatar mode needs a HeyGen look. Call list_heygen_looks, then set_video_node_look on the video_cinematic node (lookId, or ruleAssetId to turn a brand portrait into a look) after ask_user, or switch cinematicMode to heygen_video for a scene without a look.',
              { missing: ['heygenAvatarId'], nextTools: ['list_heygen_looks', 'set_video_node_look'] },
            );
          }
        }
        return runGenerateMore(deps, {
          type: WorkflowNodeType.VideoCinematic,
          message,
          config,
          contentId,
          workflowId,
        });
      }),
    {
      name: 'generate_cinematic_video',
      description:
        'Add a CINEMATIC HeyGen video to an existing draft (Generate more). Default cinematic_avatar (looks + scene prompt); or heygen_video for text/image/reference-to-video. Costs credits and takes minutes: only after the user confirmed via ask_user. If cinematic_avatar and no look is set, set one first with list_heygen_looks -> set_video_node_look (a brand portrait asset works). Instagram/TikTok default to 9:16. Not for a talking-head caption video (generate_presenter_video). Does not change the saved workflow (add_workflow_node video_cinematic for future posts).',
      schema: CINEMATIC_SCHEMA,
    },
  );
}
