import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { TenancyAuth } from '../../auth/tenancy.types';
import { typedColumnsFromConfig, typedFamilyForType } from '../../nodes/node-typed-config.util';
import { isTypedVideoNodeType, typedVideoColumnsFromConfig } from '../../nodes/video-node-typed-config.util';
import { preflightVideoNode } from '../../nodes/video-node-preflight.util';
import type { IContentRepository } from '../../repositories/interfaces/content.repository.interface';
import { normalizeLaneId } from '../../workflow/workflow-graph.util';
import { DISTRIBUTION_CHANNELS } from '../../workflow/distribution-channels.util';
import type { WorkflowService } from '../../workflow/workflow.service';
import { resolveContentForSession } from './content-scope.util';
import { runTool, toolError, toolOk } from './tool-error.util';

/** ask_user option id on the start_generation preview card (same id the plan-confirm card uses). */
export const PREVIEW_CONFIRM_OPTION_ID = 'start_post';

type PreviewNode = { nodeId: string; type: unknown; order?: number; lane?: unknown; config?: unknown };

export type GenerationPreviewStep = {
  nodeId: string;
  type: string;
  order: number;
  lane: string | null;
  settings: Record<string, unknown>;
  issue?: string;
};

export type GenerationPreview = {
  steps: GenerationPreviewStep[];
  lanes: string[];
  videoSteps: number;
  issues: string[];
  /** Short human lines for the confirm card. */
  lines: string[];
};

function isSet(v: unknown): boolean {
  if (v === null || v === undefined || v === '') return false;
  return !(Array.isArray(v) && v.length === 0);
}

function compact(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => isSet(v)));
}

/** Non-empty typed settings of one node (typed tables: video/text/translation/image/media/branch). */
export function nodeSettings(type: unknown, config: unknown): Record<string, unknown> {
  if (isTypedVideoNodeType(type)) {
    const { sourceRuleAssetId, ...cols } = typedVideoColumnsFromConfig(config);
    return compact({ ...cols, ...(sourceRuleAssetId ? { lookFromBrandAsset: sourceRuleAssetId } : {}) });
  }
  const family = typedFamilyForType(type);
  if (!family) return {};
  const cols = typedColumnsFromConfig(family, config);
  delete cols.customPrompt;
  delete cols.sourceText;
  return compact(cols);
}

function laneOf(node: PreviewNode): string | null {
  return typeof node.lane === 'string' && node.lane.trim() ? normalizeLaneId(node.lane) : null;
}

function stepLine(step: GenerationPreviewStep): string {
  const s = step.settings;
  const bits: string[] = [];
  if (step.type === 'video_presenter' || step.type === 'video_cinematic') {
    if (s.heygenAvatarId) bits.push(`look ${String(s.heygenAvatarId)}`);
    if (s.duration) bits.push(`${String(s.duration)}s`);
    if (s.cinematicMode) bits.push(String(s.cinematicMode));
    if (s.aspectRatio) bits.push(String(s.aspectRatio));
    if (step.type === 'video_presenter') bits.push(s.heygenVoiceId ? 'voice set' : 'no voice');
  } else if (step.type === 'translation' && s.targetLanguage) {
    bits.push(`to ${String(s.targetLanguage)}`);
  } else if (step.type === 'image_generation') {
    for (const k of ['style', 'aspectRatio', 'size']) if (s[k]) bits.push(String(s[k]));
  } else if (step.type === 'branch' && Array.isArray(s.channels)) {
    bits.push((s.channels as string[]).join(', '));
  }
  const head = `${step.type.replace(/_/g, ' ')}${step.lane ? ` (${step.lane})` : ''}`;
  return `${head}${bits.length ? `: ${bits.join(', ')}` : ''}${step.issue ? ` - needs: ${step.issue}` : ''}`;
}

/** Pure: what a run of this workflow will execute, in order. */
export function buildGenerationPreview(nodes: readonly PreviewNode[]): GenerationPreview {
  const steps = [...nodes]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((n, i): GenerationPreviewStep => {
      const pre = preflightVideoNode(n.type, n.config);
      return {
        nodeId: n.nodeId,
        type: String(n.type),
        order: n.order ?? i,
        lane: laneOf(n),
        settings: nodeSettings(n.type, n.config),
        ...(pre.ok ? {} : { issue: pre.missing.join(' and ') || pre.message }),
      };
    });
  const lanes = [...new Set(steps.map((s) => s.lane).filter((l): l is string => !!l))];
  const issues = steps.filter((s) => s.issue).map((s) => `${s.type} ${s.nodeId}: ${s.issue}`);
  return {
    steps,
    lanes,
    videoSteps: steps.filter((s) => isTypedVideoNodeType(s.type)).length,
    issues,
    lines: steps.map(stepLine),
  };
}

/** Words that mean the user asked for a video this run (any of the chat languages). */
const VIDEO_WORDS = /\b(videos?|reels?|clips?|shorts|footage)\b|\u1017\u102e\u1012\u102e\u101a\u102d\u102f|\u0e27\u0e34\u0e14\u0e35\u0e42\u0e2d|\u89c6\u9891|\u5f71\u7247/iu;

export function requestWantsVideo(text: string): boolean {
  return VIDEO_WORDS.test(text);
}

/** What the user asked for this run, next to what the workflow will really make. */
export type PreviewRequest = {
  /** Channels named in the request (parseRequest ids). */
  channels?: string[];
  wantsVideo?: boolean;
  /** Brand profile channels (used when the workflow has no channel lanes). */
  brandChannels?: string[];
};

export type PreviewGaps = {
  /** Channels the run will post to, human labels. */
  channels: string[];
  /** One version shared by every channel (no channel lanes). */
  shared: boolean;
  missingVideo: boolean;
  missingChannels: string[];
};

const channelLabel = (id: string) => DISTRIBUTION_CHANNELS.find((c) => c.id === id)?.label ?? id;

/** Pure: the run's real channels and what the request needs that the workflow lacks. */
export function previewGaps(preview: GenerationPreview, request: PreviewRequest = {}): PreviewGaps {
  const asked = [...new Set((request.channels ?? []).map((c) => normalizeLaneId(c)))];
  const brand = [...new Set((request.brandChannels ?? []).map((c) => normalizeLaneId(c)))];
  const shared = preview.lanes.length === 0;
  const target = shared ? (asked.length ? asked : brand) : preview.lanes;
  const known = shared ? brand : preview.lanes;
  const missingChannels = known.length ? asked.filter((c) => !known.includes(c)) : [];
  return {
    channels: target.map(channelLabel),
    shared,
    missingVideo: !!request.wantsVideo && preview.videoSteps === 0,
    missingChannels: missingChannels.map(channelLabel),
  };
}

/** ask_user observation shown instead of starting a run the user has not confirmed yet. */
export function generationPreviewPrompt(input: {
  topic: string;
  preview: GenerationPreview;
  brief?: Record<string, unknown>;
  request?: PreviewRequest;
}): string {
  const { preview } = input;
  const gaps = previewGaps(preview, input.request);
  const channels = gaps.channels.length
    ? `${gaps.channels.join(', ')}${gaps.shared && gaps.channels.length > 1 ? ' (one shared version)' : ''}`
    : 'your brand channels (one shared version)';
  const missing = [
    ...(gaps.missingVideo ? ['a video step (you asked for a video; this run makes no video)'] : []),
    ...(gaps.missingChannels.length ? [`${gaps.missingChannels.join(', ')} (not a channel on this workflow yet)`] : []),
  ];
  const needsAdding = missing.length > 0;
  const addLabel = [
    ...(gaps.missingVideo ? ['video step'] : []),
    ...gaps.missingChannels,
  ].join(' + ');
  const question = [
    `Ready to generate "${input.topic.slice(0, 120)}"?`,
    `Channels: ${channels}. Steps: ${preview.steps.length}${preview.videoSteps ? ` (${preview.videoSteps} video, uses video credits)` : ''}.`,
    ...preview.lines.slice(0, 12).map((l) => `- ${l}`),
    ...(needsAdding ? [`Missing for your request: ${missing.join('; ')}.`, `Add ${addLabel} first?`] : []),
  ].join('\n');
  return JSON.stringify({
    ok: false,
    code: 'preview_confirm',
    action: 'ask_user',
    type: 'single',
    confirmFor: 'start_generation',
    question,
    preview: { steps: preview.steps, lanes: preview.lanes, issues: preview.issues },
    gaps,
    needsAdding,
    ...(input.brief ? { brief: input.brief } : {}),
    message:
      (needsAdding
        ? `Nothing started yet. The workflow lacks what the user asked for (${missing.join('; ')}). On add_missing (or a plain yes): add the missing parts (add_workflow_node video_presenter or video_cinematic - ask which if unclear; set_workflow_channels for a missing channel), then call start_generation again to show the updated plan. On start_post run without them. `
        : 'Nothing started yet. On Start (or a plain yes) call start_generation again with the same arguments. ') +
      'This card already asks the user; do not also ask "Start now?" or any yes/no yourself. On Change, ask what to change (update_node_config / set_video_node_look) and preview again.',
    options: [
      ...(needsAdding ? [{ id: 'add_missing', label: `Add ${addLabel}`.slice(0, 40) }] : []),
      { id: PREVIEW_CONFIRM_OPTION_ID, label: needsAdding ? 'Start without them' : 'Start' },
      { id: 'change', label: 'Change settings' },
      { id: 'cancel', label: 'Cancel' },
    ],
  });
}

export function createPreviewGenerationTool(ruleId: string, workflowService: WorkflowService, auth: TenancyAuth) {
  return tool(
    async () =>
      runTool(async () => {
        const current = await workflowService.getWorkflowByRuleId(ruleId, auth);
        if (!current) return toolError('no_workflow', 'This brand has no workflow yet.');
        if (current.workflow.ruleRef && current.workflow.ruleRef !== ruleId) {
          return toolError('not_found', 'Workflow not found for this brand.');
        }
        const preview = buildGenerationPreview(current.nodes as PreviewNode[]);
        return toolOk({ workflowId: current.workflow.workflowId, ...preview });
      }),
    {
      name: 'preview_generation',
      description:
        'Read-only. Shows what a run of the saved workflow will do: every step in order with its channel lane and key settings (look, duration, voice, cinematic mode, image style, target language, branch channels) plus missing setup (issues). Use when the user asks "what will it make?" or after changing settings. Starts nothing.',
      schema: z.object({}),
    },
  );
}

export function createDescribeNodeConfigFieldsTool(ruleId: string, workflowService: WorkflowService, auth: TenancyAuth) {
  return tool(
    async ({ nodeId }) =>
      runTool(async () => {
        const current = await workflowService.getWorkflowByRuleId(ruleId, auth);
        if (!current) return toolError('no_workflow', 'This brand has no workflow yet.');
        const node = current.nodes.find((n) => n.nodeId === nodeId.trim());
        if (!node) {
          return toolError('node_not_found', `Node ${nodeId} is not on this workflow.`, { workflowId: current.workflow.workflowId });
        }
        const type = String(node.type);
        let fields: Array<{ key: string; kind: string; value: unknown }> = [];
        if (isTypedVideoNodeType(type)) {
          const cols = typedVideoColumnsFromConfig(node.config);
          const kinds: Record<string, string> = { duration: 'int', heygenAvatarIds: 'stringArray' };
          fields = Object.entries(cols)
            .filter(([k]) => k !== 'sourceRuleAssetId')
            .map(([key, value]) => ({ key, kind: kinds[key] ?? 'string', value }));
        } else {
          const family = typedFamilyForType(type);
          if (family) {
            const cols = typedColumnsFromConfig(family, node.config);
            fields = family.fields.map((f) => ({ key: f.key ?? f.col, kind: f.kind, value: cols[f.col] ?? null }));
          }
        }
        return toolOk({
          workflowId: current.workflow.workflowId,
          nodeId: node.nodeId,
          type,
          fields,
          hint: isTypedVideoNodeType(type)
            ? 'Change look with set_video_node_look; voice with list_heygen_voices then update_node_config {heygenVoiceId}; other keys with update_node_config config.'
            : 'Change a field with update_node_config config: { <key>: value }. Lane moves use lane, not laneId/channel.',
        });
      }),
    {
      name: 'describe_node_config_fields',
      description:
        'Read-only. Lists the editable typed config keys of ONE workflow node (name, kind, current value), e.g. video duration/aspectRatio/cinematicMode/heygenVoiceId, image style/aspectRatio, translation targetLanguage, branch channels. Call before update_node_config so you use real keys; never guess keys.',
      schema: z.object({ nodeId: z.string().describe('Node id from list_workflows / preview_generation.') }),
    },
  );
}

const MEDIA_FIELDS = ['video', 'videoUrl', 'image', 'imageUrl', 'url'];

function mediaUrl(layer: Record<string, unknown>): string | null {
  for (const k of MEDIA_FIELDS) {
    const v = layer[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (v && typeof v === 'object') {
      const u = (v as Record<string, unknown>).url;
      if (typeof u === 'string' && u.trim()) return u.trim();
    }
  }
  return null;
}

function mediaError(layer: Record<string, unknown>): string | null {
  for (const k of ['error', 'errorMessage', 'failureReason']) {
    const v = layer[k];
    if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 300);
  }
  return null;
}

/** Pure: per media node outcome on a draft (ready / pending / failed / empty). */
export function draftMediaOutcomes(
  nodeOutputs: Record<string, Record<string, unknown>> | undefined,
  typeOf: (nodeId: string) => string | null,
) {
  return Object.entries(nodeOutputs ?? {})
    .map(([nodeId, raw]) => {
      const layer = raw && typeof raw === 'object' ? raw : {};
      const type = typeOf(nodeId) ?? (typeof layer.type === 'string' ? layer.type : null);
      if (!type || !/video|image/.test(type)) return null;
      const url = mediaUrl(layer);
      const error = mediaError(layer);
      const status = layer._pending === true ? 'pending' : url ? 'ready' : error ? 'failed' : 'empty';
      return { nodeId, type, status, ...(url ? { url } : {}), ...(error ? { error } : {}) };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
}

export function createGetDraftMediaStatusTool(
  ruleId: string,
  workflowService: WorkflowService,
  contents: IContentRepository,
  auth: TenancyAuth,
) {
  return tool(
    async ({ contentId }) =>
      runTool(async () => {
        const scoped = await resolveContentForSession(workflowService, contents, ruleId, auth, { contentId });
        if (!scoped.ok) return scoped.observation;
        const current = await workflowService.getWorkflowByRuleId(ruleId, auth);
        const types = new Map((current?.nodes ?? []).map((n) => [n.nodeId, String(n.type)]));
        const typeOf = (id: string) => {
          if (types.has(id)) return types.get(id) ?? null;
          for (const [base, t] of types) if (id.startsWith(`${base}-`) || id.startsWith(`${base}_`)) return t;
          return null;
        };
        const media = draftMediaOutcomes(scoped.content.nodeOutputs as Record<string, Record<string, unknown>> | undefined, typeOf);
        return toolOk({
          contentId: scoped.content.contentId,
          status: String(scoped.content.status),
          media,
          videos: media.filter((m) => m.type.includes('video')).length,
          hint: media.some((m) => m.status === 'failed')
            ? 'Say which media failed and why in one line; offer to retry (generate_presenter_video / generate_cinematic_video or rerun_content_node) via ask_user.'
            : media.some((m) => m.status === 'pending')
              ? 'Still rendering: tell the user it will appear on the draft when done.'
              : media.some((m) => m.status === 'empty')
                ? 'Some media never came back (empty): say it did not appear, do not call it ready; offer to retry via ask_user.'
                : undefined,
          allReady: media.length > 0 && media.every((m) => m.status === 'ready'),
        });
      }),
    {
      name: 'get_draft_media_status',
      description:
        'Read-only. Outcome of the videos and images on a draft (latest if contentId omitted): per node ready (with url) / pending (still rendering) / failed (with error) / empty. Use when the user asks "is my video done?", "why no video?", or after a generate-more video.',
      schema: z.object({ contentId: z.string().optional().describe('Draft id; omit for the latest.') }),
    },
  );
}
