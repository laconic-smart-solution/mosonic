import { randomUUID } from 'node:crypto';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { TenancyAuth } from '../../auth/tenancy.types';
import { WorkflowNodeType } from '../../nodes/schemas/workflow-node.schema';
import { parseWorkflowNodeConfig } from '../../nodes/workflow-node-config.zod';
import { normalizeVideoNodeType } from '../../nodes/video-node-type.util';
import { DISTRIBUTION_CHANNELS } from '../../workflow/distribution-channels.util';
import { buildWorkflowEdges } from '../../workflow/workflow-graph-edge-builder.util';
import { normalizeLaneId } from '../../workflow/workflow-graph.util';
import { assertValidWorkflowNodeOrder } from '../../workflow/workflow-node-order.util';
import { WorkflowStatus } from '../../workflow/schemas/workflow.schema';
import type { WorkflowService } from '../../workflow/workflow.service';
import { runTool, toolError } from './tool-error.util';
import { showWorkflowPayload, workflowNodeLabel } from './workflow-tool.util';

/**
 * Structural workflow edits from chat: reorder, remove, add a node, and set
 * the channel lanes. Every edit is validated with the same graph rules the
 * canvas save uses (WorkflowService.saveNodes). When a request breaks those
 * rules the tool returns `order_not_supported` / `edit_not_supported` with
 * `openCanvas: true`, so the AI says it can't and the client shows an
 * "Open workflow canvas" button - it never pretends the change happened.
 */

type EditableNode = {
  nodeId: string;
  type: WorkflowNodeType;
  order: number;
  isLocked: boolean;
  config: Record<string, unknown>;
  lane: string | null;
  userPrompt?: string;
  x?: number;
  y?: number;
};

type Snapshot = NonNullable<Awaited<ReturnType<WorkflowService['getWorkflowByRuleId']>>>;

const KNOWN_LANES = new Set(DISTRIBUTION_CHANNELS.map((c) => c.id));
const CHANNEL_CONFIG_TYPES = new Set<string>([
  WorkflowNodeType.Adapt,
  WorkflowNodeType.ImageGeneration,
]);
const TRUNK_ADDABLE = new Set<string>([
  WorkflowNodeType.KeywordPlanner,
  WorkflowNodeType.Intelligence,
  WorkflowNodeType.Transcription,
  WorkflowNodeType.Subtitle,
]);
const LANE_ADDABLE = new Set<string>([
  WorkflowNodeType.ImageGeneration,
  WorkflowNodeType.VideoPresenter,
  WorkflowNodeType.VideoCinematic,
  WorkflowNodeType.VideoGeneration,
  WorkflowNodeType.Summarization,
  WorkflowNodeType.Translation,
]);
const STRUCTURAL = new Set<string>([
  WorkflowNodeType.TextGeneration,
  WorkflowNodeType.Branch,
  WorkflowNodeType.Merge,
]);

export function canvasError(
  code: string,
  message: string,
  ruleId: string,
  extra: Record<string, unknown> = {},
): string {
  return toolError(code, message, {
    openCanvas: true,
    canvasPath: `/workflow/${ruleId}`,
    ...extra,
  });
}

function laneOf(node: { lane?: string | null; config?: Record<string, unknown> | null }): string {
  if (typeof node.lane === 'string' && node.lane.trim()) return normalizeLaneId(node.lane);
  const laneId = node.config?.laneId;
  return typeof laneId === 'string' && laneId.trim() ? normalizeLaneId(laneId) : '';
}

function isBranched(nodes: Array<{ type: string }>): boolean {
  const types = new Set(nodes.map((n) => String(n.type)));
  return types.has(WorkflowNodeType.Branch) && types.has(WorkflowNodeType.Merge);
}

function toEditable(snapshot: Snapshot): EditableNode[] {
  return [...snapshot.nodes]
    .sort((a, b) => a.order - b.order)
    .map((n) => ({
      nodeId: n.nodeId,
      // Legacy video_generation is shown/edited as presenter or cinematic by mode.
      type: normalizeVideoNodeType(n.type as WorkflowNodeType, n.config) as WorkflowNodeType,
      order: n.order,
      isLocked: n.isLocked,
      config: (n.config ?? {}) as Record<string, unknown>,
      lane: laneOf(n) || null,
      ...(typeof n.x === 'number' ? { x: n.x } : {}),
      ...(typeof n.y === 'number' ? { y: n.y } : {}),
    }));
}

function renumber(nodes: EditableNode[]): EditableNode[] {
  return nodes.map((n, i) => ({ ...n, order: i + 1 }));
}

/**
 * Rules the graph builder would otherwise silently "fix": in a branched
 * workflow Branch comes right after the trunk, every channel step sits
 * between Branch and Merge, Adapt opens each lane, and Merge is last.
 * Returns a plain-language reason, or null when the order is valid.
 */
export function explainInvalidOrder(nodes: EditableNode[]): string | null {
  try {
    assertValidWorkflowNodeOrder(nodes);
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
  if (!isBranched(nodes)) return null;
  const branch = nodes.find((n) => n.type === WorkflowNodeType.Branch)!;
  const merge = nodes.find((n) => n.type === WorkflowNodeType.Merge)!;
  if (merge.order !== Math.max(...nodes.map((n) => n.order))) {
    return 'Merge must be the last step.';
  }
  for (const n of nodes) {
    const onLane = Boolean(n.lane);
    if (onLane && (n.order < branch.order || n.order > merge.order)) {
      return `${workflowNodeLabel(n.type)} is a channel step, so it has to come after Branch (Branch splits the post into one lane per channel).`;
    }
    if (!onLane && n !== merge && n.order > branch.order) {
      return `${workflowNodeLabel(n.type)} runs once for every channel, so it has to come before Branch.`;
    }
  }
  const lanes = new Set(nodes.map((n) => n.lane).filter(Boolean));
  for (const lane of lanes) {
    const laneNodes = nodes.filter((n) => n.lane === lane);
    const adapt = laneNodes.find((n) => n.type === WorkflowNodeType.Adapt);
    if (adapt && laneNodes.some((n) => n.type !== WorkflowNodeType.Adapt && n.order < adapt.order)) {
      return `On each channel, Adapt has to come first (it rewrites the text for ${lane} before images or video are made).`;
    }
  }
  return null;
}

async function loadEditable(
  ruleId: string,
  workflowService: WorkflowService,
  auth: TenancyAuth,
): Promise<{ snapshot: Snapshot } | { error: string }> {
  const snapshot = await workflowService.getWorkflowByRuleId(ruleId, auth);
  if (!snapshot) {
    return { error: toolError('no_workflow', 'This brand has no workflow yet. Create one first.') };
  }
  const status = String(snapshot.workflow.status);
  if (status !== WorkflowStatus.Ready && status !== 'ready') {
    return {
      error: toolError('workflow_not_ready', `This workflow is ${status}. Wait until it is ready.`, {
        workflowId: snapshot.workflow.workflowId,
        status,
      }),
    };
  }
  if (snapshot.workflow.ruleRef && snapshot.workflow.ruleRef !== ruleId) {
    return { error: toolError('not_found', 'Workflow not found for this brand.') };
  }
  return { snapshot };
}

async function saveEdited(
  ruleId: string,
  workflowService: WorkflowService,
  auth: TenancyAuth,
  snapshot: Snapshot,
  nodes: EditableNode[],
  brandName: string | undefined,
  extra: Record<string, unknown>,
): Promise<string> {
  const invalid = explainInvalidOrder(nodes);
  if (invalid) {
    return canvasError('order_not_supported', `Not changed: ${invalid}`, ruleId);
  }
  let edges;
  try {
    edges = buildWorkflowEdges(
      nodes.map((n) => ({
        nodeId: n.nodeId,
        type: n.type,
        order: n.order,
        isLocked: n.isLocked,
        config: n.config as never,
        lane: n.lane,
      })),
    );
  } catch (err) {
    return canvasError(
      'order_not_supported',
      `Not changed: ${err instanceof Error ? err.message : String(err)}`,
      ruleId,
    );
  }
  await workflowService.saveNodesForRule(
    ruleId,
    {
      name: snapshot.workflow.name,
      nodes: nodes.map((n) => ({
        nodeId: n.nodeId,
        type: n.type,
        order: n.order,
        isLocked: n.isLocked,
        config: n.config as never,
        ...(n.lane ? { lane: n.lane } : {}),
        ...(n.userPrompt !== undefined ? { userPrompt: n.userPrompt } : {}),
        ...(typeof n.x === 'number' ? { x: n.x } : {}),
        ...(typeof n.y === 'number' ? { y: n.y } : {}),
      })),
      edges,
    },
    auth,
  );
  const refreshed = (await workflowService.getWorkflowByRuleId(ruleId, auth)) ?? snapshot;
  return showWorkflowPayload({
    workflowId: refreshed.workflow.workflowId,
    ruleId,
    status: String(refreshed.workflow.status),
    name: refreshed.workflow.name,
    nodes: refreshed.nodes,
    edges: refreshed.edges,
    brandName,
    extra: { changed: true, ...extra },
  });
}

export function createReorderWorkflowNodesTool(
  ruleId: string,
  workflowService: WorkflowService,
  auth: TenancyAuth,
  brandName?: string,
) {
  return tool(
    async ({ nodeIds }) =>
      runTool(async () => {
        const loaded = await loadEditable(ruleId, workflowService, auth);
        if ('error' in loaded) return loaded.error;
        const nodes = toEditable(loaded.snapshot);
        const byId = new Map(nodes.map((n) => [n.nodeId, n]));
        const requested = nodeIds.map((id) => id.trim()).filter(Boolean);
        const unknown = requested.filter((id) => !byId.has(id));
        if (unknown.length > 0) {
          return toolError('node_not_found', `Unknown node ids: ${unknown.join(', ')}. Use the ids from the live workflow.`);
        }
        // Only the listed nodes move: they are permuted among the slots they
        // already occupy, every other node keeps its place.
        const listed = new Set(requested);
        const queue = requested.map((id) => byId.get(id)!);
        const reordered = renumber(
          nodes.map((n) => (listed.has(n.nodeId) ? queue.shift()! : n)),
        );
        return saveEdited(ruleId, workflowService, auth, loaded.snapshot, reordered, brandName, {});
      }),
    {
      name: 'reorder_workflow_nodes',
      description:
        'Change the order of workflow steps. Pass the nodeIds of the steps to move, in their new relative order (ids from the live workflow); steps you omit stay where they are. Validated with the canvas rules: Text comes before Branch/Image/Adapt; in a multi-channel workflow Branch comes before every channel step, Adapt opens each channel lane, Merge is last. On order_not_supported nothing changed (follow its next hint).',
      schema: z.object({
        nodeIds: z.array(z.string()).min(1).describe('Node ids in the desired order.'),
      }),
    },
  );
}

export function createRemoveWorkflowNodeTool(
  ruleId: string,
  workflowService: WorkflowService,
  auth: TenancyAuth,
  brandName?: string,
) {
  return tool(
    async ({ nodeId }) =>
      runTool(async () => {
        const loaded = await loadEditable(ruleId, workflowService, auth);
        if ('error' in loaded) return loaded.error;
        const nodes = toEditable(loaded.snapshot);
        const target = nodes.find((n) => n.nodeId === nodeId.trim());
        if (!target) return toolError('node_not_found', `Node ${nodeId} is not on this workflow.`);
        if (target.isLocked || STRUCTURAL.has(target.type)) {
          return canvasError(
            'edit_not_supported',
            `${workflowNodeLabel(target.type)} can't be removed from chat; the workflow needs it.`,
            ruleId,
          );
        }
        if (target.type === WorkflowNodeType.Adapt && nodes.some((n) => n.lane === target.lane && n.nodeId !== target.nodeId)) {
          return canvasError(
            'edit_not_supported',
            `Adapt opens the ${target.lane} lane. To drop that channel use set_workflow_channels instead.`,
            ruleId,
          );
        }
        const rest = renumber(nodes.filter((n) => n.nodeId !== target.nodeId));
        return saveEdited(ruleId, workflowService, auth, loaded.snapshot, rest, brandName, {
          removed: { nodeId: target.nodeId, label: workflowNodeLabel(target.type), lane: target.lane },
        });
      }),
    {
      name: 'remove_workflow_node',
      description:
        'Remove one step from the workflow (for example the Image step, or Web search). Text, Branch and Merge cannot be removed. To drop a whole channel use set_workflow_channels.',
      schema: z.object({ nodeId: z.string().describe('Node id from the live workflow.') }),
    },
  );
}

export function createAddWorkflowNodeTool(
  ruleId: string,
  workflowService: WorkflowService,
  auth: TenancyAuth,
  brandName?: string,
) {
  return tool(
    async ({ type: requestedType, lane, config }) =>
      runTool(async () => {
        // Old name: video_generation + config.mode picks presenter or cinematic.
        const type = normalizeVideoNodeType(requestedType, config) as typeof requestedType;
        const loaded = await loadEditable(ruleId, workflowService, auth);
        if ('error' in loaded) return loaded.error;
        const nodes = toEditable(loaded.snapshot);
        const branched = isBranched(nodes);
        const laneId = lane ? normalizeLaneId(lane) : '';
        if (!TRUNK_ADDABLE.has(type) && !LANE_ADDABLE.has(type)) {
          return canvasError('edit_not_supported', `${workflowNodeLabel(type)} can't be added from chat.`, ruleId);
        }
        const laneConfig = {
          ...(laneId ? { laneId } : {}),
          ...(laneId && CHANNEL_CONFIG_TYPES.has(type) ? { channel: laneId } : {}),
        };
        let parsed = parseWorkflowNodeConfig(type as WorkflowNodeType, { ...(config ?? {}), ...laneConfig });
        // A free-text style ("watercolor") isn't a config value: add the step anyway, the style stays a brand note.
        let droppedConfig = false;
        if (!parsed.ok && config && Object.keys(config).length > 0) {
          const plain = parseWorkflowNodeConfig(type as WorkflowNodeType, laneConfig);
          if (plain.ok) {
            parsed = plain;
            droppedConfig = true;
          }
        }
        if (!parsed.ok) {
          return toolError('invalid_config', parsed.errors.join('; '));
        }
        const node: EditableNode = {
          nodeId: randomUUID(),
          type: type as WorkflowNodeType,
          order: 0,
          isLocked: false,
          config: parsed.data as Record<string, unknown>,
          lane: null,
        };
        let next: EditableNode[];
        if (TRUNK_ADDABLE.has(type)) {
          if (nodes.some((n) => n.type === type)) {
            return toolError('already_present', `The workflow already has a ${workflowNodeLabel(type)} step.`);
          }
          next = [...nodes];
          if (type === WorkflowNodeType.Subtitle) {
            // Subtitle only formats transcription text, so it sits right after Transcription.
            const trIndex = nodes.findIndex((n) => n.type === WorkflowNodeType.Transcription);
            if (trIndex < 0) {
              return toolError(
                'transcription_required',
                'Add a Transcription step first; Subtitle turns its text into captions.',
              );
            }
            next.splice(trIndex + 1, 0, node);
          } else {
            const textIndex = nodes.findIndex((n) => n.type === WorkflowNodeType.TextGeneration);
            next.splice(Math.max(0, textIndex), 0, node);
          }
        } else if (branched) {
          if (!laneId || !nodes.some((n) => n.lane === laneId)) {
            const lanes = [...new Set(nodes.map((n) => n.lane).filter(Boolean))];
            return toolError('lane_required', `Pick a channel lane for this step: ${lanes.join(', ')}.`, { availableLanes: lanes });
          }
          if (nodes.some((n) => n.type === type && n.lane === laneId)) {
            return toolError('lane_taken', `${laneId} already has a ${workflowNodeLabel(type)} step.`);
          }
          node.lane = laneId;
          const mergeIndex = nodes.findIndex((n) => n.type === WorkflowNodeType.Merge);
          next = [...nodes];
          next.splice(mergeIndex, 0, node);
        } else {
          if (laneId) node.lane = laneId;
          next = [...nodes, node];
        }
        return saveEdited(ruleId, workflowService, auth, loaded.snapshot, renumber(next), brandName, {
          added: { nodeId: node.nodeId, label: workflowNodeLabel(type), lane: node.lane },
          ...(droppedConfig
            ? { note: 'Step added with its default settings. A requested style is not a setting here: keep it as a brand note (remember) and it will guide the images.' }
            : {}),
        });
      }),
    {
      name: 'add_workflow_node',
      description:
        'Purpose: add ONE new step to the existing workflow. keyword_planner or intelligence (Web search) go before Text; image_generation / video_presenter (HeyGen avatar talking; needs an avatar + voice picked on the canvas) / video_cinematic (HeyGen cinematic_avatar / heygen_video) / summarization / translation go on a channel lane. Plain "add a video": ask which kind with ask_user. transcription (OpenAI Whisper; needs config.sourceUrl audio/video URL at run, or an upstream video) goes before Text; subtitle (local SRT/VTT from the transcription text, no AI; config.format srt|vtt, maxCharsPerLine) needs a transcription step and is placed right after it. For captions/subtitles: add transcription, then subtitle. ' +
          'Use when: "add an image step", "add a translation", or the user tapped Add image step. ' +
          'Do NOT use: to change an existing step setting or move it to another channel (update_node_config); to create a first workflow (apply_default_workflow); to rebuild the whole workflow (generate_workflow); to change channels for the whole workflow (set_workflow_channels). ' +
          'Args: type; lane (channel id) in a multi-channel workflow; config only with real settings (translation needs config.targetLanguage). A free-text style is not a setting: the step is added with defaults and the style stays a brand note. Style or image request ("watercolor") with no post yet and no Image step: add the image step and continue the request; do not ask first. ' +
          'Errors: already_present / lane_taken (it exists, say so), lane_required (ask which channel), transcription_required (add transcription first), edit_not_supported (point to the workflow canvas button), invalid_config.',
      schema: z.object({
        type: z.enum([
          'keyword_planner',
          'intelligence',
          'image_generation',
          'video_presenter',
          'video_cinematic',
          'video_generation',
          'summarization',
          'translation',
          'transcription',
          'subtitle',
        ]),
        lane: z.string().optional().describe('Channel lane id, e.g. tiktok.'),
        config: z.record(z.string(), z.unknown()).optional(),
      }),
    },
  );
}

export function createSetWorkflowChannelsTool(
  ruleId: string,
  workflowService: WorkflowService,
  auth: TenancyAuth,
  brandName?: string,
) {
  return tool(
    async ({ channels }) =>
      runTool(async () => {
        const wanted = [...new Set(channels.map((c) => normalizeLaneId(c)).filter(Boolean))];
        const unsupported = wanted.filter((c) => !KNOWN_LANES.has(c));
        if (unsupported.length > 0) {
          return toolError(
            'unsupported_channel',
            `${unsupported.join(', ')} is not a supported channel. Supported: ${DISTRIBUTION_CHANNELS.map((c) => c.label).join(', ')}.`,
          );
        }
        if (wanted.length === 0) return toolError('no_channels', 'Pick at least one channel.');
        const loaded = await loadEditable(ruleId, workflowService, auth);
        if ('error' in loaded) return loaded.error;
        const nodes = toEditable(loaded.snapshot);
        if (!isBranched(nodes)) {
          return canvasError(
            'edit_not_supported',
            'This workflow has no channel lanes, so channels cannot be changed from chat. Change them on the workflow canvas.',
            ruleId,
          );
        }
        const present = [...new Set(nodes.map((n) => n.lane).filter((l): l is string => Boolean(l)))];
        const kept = nodes.filter((n) => !n.lane || wanted.includes(n.lane));
        const missing = wanted.filter((c) => !present.includes(c));
        // New lanes copy the richest existing lane (its Adapt + Image etc.).
        const template = present
          .map((lane) => nodes.filter((n) => n.lane === lane))
          .sort((a, b) => b.length - a.length)[0] ?? [];
        const added: EditableNode[] = [];
        for (const lane of missing) {
          for (const src of template) {
            const config: Record<string, unknown> = { ...src.config, laneId: lane };
            if (CHANNEL_CONFIG_TYPES.has(src.type)) config.channel = lane;
            added.push({ ...src, nodeId: randomUUID(), lane, config, x: undefined, y: undefined });
          }
        }
        const mergeIndex = kept.findIndex((n) => n.type === WorkflowNodeType.Merge);
        const next = [...kept];
        next.splice(mergeIndex, 0, ...added);
        const removedLanes = present.filter((l) => !wanted.includes(l));
        if (removedLanes.length === 0 && missing.length === 0) {
          return toolError('no_change', `The workflow already uses exactly: ${wanted.join(', ')}.`);
        }
        return saveEdited(ruleId, workflowService, auth, loaded.snapshot, renumber(next), brandName, {
          channels: wanted,
          removedLanes,
          addedLanes: missing,
        });
      }),
    {
      name: 'set_workflow_channels',
      description:
        'Set which channel lanes the saved workflow template produces (e.g. ["tiktok"] for TikTok only). Removes lanes not listed and adds missing ones by copying an existing lane. Use after the brand channels change so the workflow matches, or when they ask to change the workflow/canvas channels. Does not change the brand profile (update_rule does). Not for putting the current post on another channel ("add TikTok", "post this on Instagram too"): use generate_more_adapt.',
      schema: z.object({
        channels: z.array(z.string()).min(1).describe('Channel ids: instagram, facebook, linkedin, youtube, tiktok, rednote.'),
      }),
    },
  );
}
