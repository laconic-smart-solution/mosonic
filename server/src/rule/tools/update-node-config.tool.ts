import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { TenancyAuth } from '../../auth/tenancy.types';
import type { LlmService } from '../../llm/llm.service';
import { WorkflowNodeType } from '../../nodes/schemas/workflow-node.schema';
import {
  parseWorkflowNodeConfig,
  rejectedVideoPatchKeys,
} from '../../nodes/workflow-node-config.zod';
import { DISTRIBUTION_CHANNELS } from '../../workflow/distribution-channels.util';
import { buildWorkflowEdges } from '../../workflow/workflow-graph-edge-builder.util';
import { normalizeLaneId } from '../../workflow/workflow-graph.util';
import { WorkflowStatus } from '../../workflow/schemas/workflow.schema';
import type { WorkflowService } from '../../workflow/workflow.service';
import { runTool, toolError } from './tool-error.util';
import { showWorkflowPayload } from './workflow-tool.util';

const LANE_NODE_TYPES = new Set<WorkflowNodeType>([
  WorkflowNodeType.Adapt,
  WorkflowNodeType.ImageGeneration,
  WorkflowNodeType.VideoPresenter,
  WorkflowNodeType.VideoCinematic,
  WorkflowNodeType.VideoGeneration,
  WorkflowNodeType.Summarization,
  WorkflowNodeType.Translation,
]);

const CHANNEL_CONFIG_TYPES = new Set<WorkflowNodeType>([
  WorkflowNodeType.Adapt,
  WorkflowNodeType.ImageGeneration,
]);

const KNOWN_LANES = new Set(DISTRIBUTION_CHANNELS.map((channel) => channel.id));

const DRAFT_RERUN_CONFIG_KEYS = new Set([
  'useBrandLogo',
  'mode',
  'imageEdit',
  'logo',
]);

const UPDATE_NODE_CONFIG_SCHEMA = z.object({
  nodeId: z.string().describe('Node id from list_workflows or a workflow card.'),
  lane: z
    .string()
    .optional()
    .describe(
      'Move this node onto a channel lane: instagram, facebook, linkedin, tiktok, youtube, or rednote. This is how an image or video changes platform. The canvas label comes from this lane, not from a free-text config field.',
    ),
  userPrompt: z
    .string()
    .max(2000)
    .optional()
    .describe('Replacement prompt for this node only. Omit to leave it unchanged.'),
  config: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(
      'Partial config patch merged onto the current node config. To retarget a channel, prefer lane. config.channel and config.laneId are treated as a lane move.',
    ),
});

export function createUpdateNodeConfigTool(
  ruleId: string,
  workflowService: WorkflowService,
  llm: LlmService,
  auth: TenancyAuth,
  brandName?: string,
) {
  return tool(
    async ({ nodeId, lane, userPrompt, config }) =>
      runTool(async () => {
        const trimmedId = nodeId.trim();
        if (!trimmedId) {
          return toolError('node_not_found', 'nodeId is required.');
        }

        const requestedLane = readRequestedLane(lane, config);
        const hasPrompt = userPrompt !== undefined;
        const configKeys = config ? Object.keys(config) : [];
        if (configKeys.some((key) => DRAFT_RERUN_CONFIG_KEYS.has(key))) {
          return toolError(
            'use_content_rerun',
            'That does not change a generated image or caption. Call rerun_content_node with the draft node id, mode=edit for images, and useBrandLogo=true when they asked for the logo.',
          );
        }
        if (!hasPrompt && configKeys.length === 0 && !requestedLane) {
          return toolError(
            'empty_patch',
            'Pass lane, userPrompt, and/or at least one config field to update.',
          );
        }

        const current = await workflowService.getWorkflowByRuleId(ruleId, auth);
        if (!current) {
          return toolError(
            'no_workflow',
            'This brand has no workflow yet. Create one before editing a node. Offer to set up the default workflow with ask_user (Yes / Not now); do not mention the canvas or drafts.',
          );
        }

        const status = String(current.workflow.status);
        if (status === WorkflowStatus.Generating || status === 'generating') {
          return toolError(
            'generation_in_progress',
            'This workflow is still being generated. Wait until it is ready before editing a node.',
            { workflowId: current.workflow.workflowId, status },
          );
        }
        if (status !== WorkflowStatus.Ready && status !== 'ready') {
          return toolError(
            'workflow_not_ready',
            `This workflow is ${status}. It must be ready before a node config can change.`,
            { workflowId: current.workflow.workflowId, status },
          );
        }
        if (current.workflow.ruleRef && current.workflow.ruleRef !== ruleId) {
          return toolError('not_found', 'Workflow not found for this brand.');
        }

        const target = current.nodes.find((node) => node.nodeId === trimmedId);
        if (!target) {
          return toolError(
            'node_not_found',
            `Node ${trimmedId} is not on this workflow.`,
            { workflowId: current.workflow.workflowId },
          );
        }

        const currentLane = readNodeLane(target);
        let nextLane = currentLane;
        if (requestedLane) {
          if (!LANE_NODE_TYPES.has(target.type as WorkflowNodeType)) {
            return toolError(
              'lane_not_supported',
              `${target.type} is not a channel node. Move an image, video, adapt, summary, or translation node instead.`,
              { nodeId: trimmedId, type: target.type },
            );
          }
          const normalized = normalizeLaneId(requestedLane);
          if (!normalized || !KNOWN_LANES.has(normalized)) {
            return toolError(
              'invalid_lane',
              `Unknown channel "${requestedLane}". Use ${[...KNOWN_LANES].join(', ')}.`,
              { nodeId: trimmedId },
            );
          }
          const present = lanesOnWorkflow(current.nodes);
          if (!present.includes(normalized) && normalized !== currentLane) {
            return toolError(
              'unknown_lane',
              `This workflow has no ${normalized} lane. Available lanes: ${present.join(', ') || 'none'}.`,
              { nodeId: trimmedId, availableLanes: present },
            );
          }
          const taken = current.nodes.some(
            (node) =>
              node.nodeId !== trimmedId &&
              node.type === target.type &&
              readNodeLane(node) === normalized,
          );
          if (taken) {
            return toolError(
              'lane_taken',
              `Another ${target.type} node is already on ${normalized}.`,
              { nodeId: trimmedId, lane: normalized },
            );
          }
          nextLane = normalized;
          const otherKeys = configKeys.filter((key) => key !== 'channel' && key !== 'laneId');
          if (nextLane === currentLane && !hasPrompt && otherKeys.length === 0) {
            return toolError(
              'lane_unchanged',
              `Nothing changed: this ${target.type} step is already on ${currentLane}.`,
              { nodeId: trimmedId, lane: currentLane },
            );
          }
        }

        const rejectedKeys = rejectedVideoPatchKeys(
          target.type as WorkflowNodeType,
          configKeys.filter((key) => key !== 'channel' && key !== 'laneId'),
        );
        if (rejectedKeys.length) {
          return toolError(
            'invalid_config',
            `${target.type} does not accept: ${rejectedKeys.join(', ')}. Call describe_node_config_fields for valid keys.`,
            { nodeId: trimmedId, rejectedKeys },
          );
        }

        const mergedConfig: Record<string, unknown> = {
          ...(target.config ?? {}),
          ...(config ?? {}),
        };
        if (nextLane) {
          mergedConfig.laneId = nextLane;
          if (CHANNEL_CONFIG_TYPES.has(target.type as WorkflowNodeType)) {
            mergedConfig.channel = nextLane;
          } else {
            delete mergedConfig.channel;
          }
        }
        const parsed = parseWorkflowNodeConfig(
          target.type as WorkflowNodeType,
          mergedConfig,
        );
        if (!parsed.ok) {
          return toolError(
            'invalid_config',
            parsed.errors.join('; '),
            { errors: parsed.errors, nodeId: trimmedId },
          );
        }
        try {
          llm.validateWorkflowNodeConfig(
            target.type as WorkflowNodeType,
            parsed.data,
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return toolError('invalid_config', message, {
            errors: [message],
            nodeId: trimmedId,
          });
        }

        const prompt = hasPrompt ? userPrompt.slice(0, 2000) : undefined;
        const nodesToSave = current.nodes.map((node) => {
          const isTarget = node.nodeId === trimmedId;
          const lane = isTarget ? nextLane : readNodeLane(node);
          return {
            nodeId: node.nodeId,
            type: node.type,
            order: node.order,
            isLocked: node.isLocked,
            config: isTarget
              ? (parsed.data as Record<string, unknown>)
              : (node.config ?? {}),
            ...(isTarget && prompt !== undefined ? { userPrompt: prompt } : {}),
            ...(lane ? { lane } : {}),
            ...(typeof node.x === 'number' ? { x: node.x } : {}),
            ...(typeof node.y === 'number' ? { y: node.y } : {}),
          };
        });
        const laneChanged = nextLane !== currentLane;
        const edges =
          laneChanged && isBranchedWorkflow(current.nodes)
            ? buildWorkflowEdges(
                nodesToSave.map((node) => ({
                  nodeId: node.nodeId,
                  type: node.type,
                  order: node.order,
                  isLocked: node.isLocked,
                  config: node.config ?? {},
                  lane: node.lane ?? null,
                })),
              )
            : (current.edges ?? []);
        await workflowService.saveNodesForRule(
          ruleId,
          {
            name: current.workflow.name,
            nodes: nodesToSave,
            edges,
          },
          auth,
        );

        const refreshed = await workflowService.getWorkflowByRuleId(ruleId, auth);
        const view = refreshed ?? current;
        const savedTarget = view.nodes.find((node) => node.nodeId === trimmedId);
        const savedLane = savedTarget ? readNodeLane(savedTarget) : '';
        if (requestedLane && savedLane !== nextLane) {
          return toolError(
            'lane_not_changed',
            `The ${target.type} step is still on ${savedLane || 'no channel'}, not ${nextLane}.`,
            { nodeId: trimmedId, lane: savedLane },
          );
        }
        return showWorkflowPayload({
          workflowId: view.workflow.workflowId,
          ruleId,
          status: String(view.workflow.status),
          name: view.workflow.name,
          nodes: view.nodes,
          edges: view.edges,
          brandName,
          ...(requestedLane ? { extra: { laneChange: { from: currentLane || null, to: savedLane } } } : {}),
        });
      }),
    {
      name: 'update_node_config',
      description:
        'Purpose: change the settings of ONE existing workflow step (its channel lane, prompt or size). Never adds, removes or reorders steps. ' +
          'Use when: video_presenter voice/orientation/expressiveness/motion/background (config.heygenVoiceId from list_heygen_voices, heygenOrientation portrait|landscape, heygenExpressiveness low|medium|high, heygenMotionPrompt, heygenBackgroundUrl, removeBackground; look via set_video_node_look); "the image/video is for TikTok" (move that step: set lane; this is not a brand-channel change, no update_rule), "make the text prompt friendlier", "square images". Say the channel changed only when laneChange in the result shows it. ' +
          'Do NOT use: to add or remove a step (add_workflow_node / remove_workflow_node); to change the order (reorder_workflow_nodes); to change which channels the whole workflow makes (set_workflow_channels); to edit a generated caption or image or add the logo (rerun_content_node). ' +
          'Args: nodeId from list_workflows (never guessed); lane one of instagram, facebook, linkedin, tiktok, youtube, rednote (config.channel is treated as a lane move); config fields valid for that step type (call get_node_config first if unsure). The workflow must be ready. Does not run the pipeline. ' +
          'Errors: node_not_found (re-list, do not guess), invalid_config (setting not available, or a presenter-only / cinematic-only key on the other video type), workflow_not_ready (wait), no_workflow (offer apply_default_workflow).',
      schema: UPDATE_NODE_CONFIG_SCHEMA,
    },
  );
}

function readRequestedLane(
  lane: string | undefined,
  config: Record<string, unknown> | undefined,
): string {
  if (typeof lane === 'string' && lane.trim()) return lane.trim();
  const laneId = config?.laneId;
  if (typeof laneId === 'string' && laneId.trim()) return laneId.trim();
  const channel = config?.channel;
  if (typeof channel === 'string' && channel.trim()) return channel.trim();
  return '';
}

function readNodeLane(node: {
  lane?: string | null;
  config?: Record<string, unknown> | null;
}): string {
  if (typeof node.lane === 'string' && node.lane.trim()) {
    return normalizeLaneId(node.lane);
  }
  const laneId = node.config?.laneId;
  if (typeof laneId === 'string' && laneId.trim()) return normalizeLaneId(laneId);
  return '';
}

function lanesOnWorkflow(
  nodes: Array<{ lane?: string | null; config?: Record<string, unknown> | null }>,
): string[] {
  return [...new Set(nodes.map((node) => readNodeLane(node)).filter(Boolean))];
}

function isBranchedWorkflow(nodes: Array<{ type: string }>): boolean {
  const types = new Set(nodes.map((node) => String(node.type)));
  return (
    types.has(WorkflowNodeType.Branch) && types.has(WorkflowNodeType.Merge)
  );
}
