import type { TenancyAuth } from '../../auth/tenancy.types';
import { WorkflowStatus } from '../../workflow/schemas/workflow.schema';
import type { WorkflowService } from '../../workflow/workflow.service';
import {
  assignOrderFromGraph,
  type WorkflowGraphEdge,
} from '../../workflow/workflow-graph.util';
import { toolError, toolOk } from './tool-error.util';

/**
 * The one set of step names used by the workflow card (client
 * `workflowCard.types` in en/chat.json) AND by the AI in its replies, so the
 * reply never says "Intelligence" while the card says "Web search".
 */
export const WORKFLOW_NODE_LABELS: Record<string, string> = {
  keyword_planner: 'Keyword planner',
  intelligence: 'Web search',
  text_generation: 'Text',
  image_generation: 'Image',
  video_presenter: 'Presenter video',
  video_cinematic: 'Cinematic video',
  video_generation: 'Video',
  translation: 'Translation',
  transcription: 'Transcription',
  summarization: 'Summary',
  branch: 'Branch',
  adapt: 'Adapt',
  merge: 'Merge',
};

export function workflowNodeLabel(type: string): string {
  return WORKFLOW_NODE_LABELS[type] ?? type;
}

const LEGACY_NAME = /^workflow for rule\s/i;

/** Brand name wins; a legacy "Workflow for rule <id>" name is never shown. */
export function cardWorkflowName(
  brandName: string | null | undefined,
  storedName: string | null | undefined,
): string {
  if ((brandName ?? '').trim()) return workflowDisplayName(brandName);
  const stored = (storedName ?? '').trim();
  return stored && !LEGACY_NAME.test(stored) ? stored : 'Workflow';
}

/** Card title: "<brand> · Workflow" - never an internal id. */
export function workflowDisplayName(brandName: string | null | undefined): string {
  const brand = (brandName ?? '').trim();
  return brand ? `${brand} · Workflow` : 'Workflow';
}

export type WorkflowNodeSummary = {
  nodeId: string;
  type: string;
  label: string;
  order: number;
  lane: string | null;
  isLocked: boolean;
};

type WorkflowNodeLike = {
  nodeId: string;
  type: string;
  order: number;
  isLocked: boolean;
  lane?: string | null;
};

/**
 * Nodes in execution order. When edges are given the order comes from the
 * graph (the same order saveNodes persists), so the card and the AI never
 * disagree with what actually runs.
 */
export function summarizeWorkflowNodes(
  nodes: WorkflowNodeLike[],
  edges: WorkflowGraphEdge[] = [],
): WorkflowNodeSummary[] {
  const ordered = edges.length > 0 ? assignOrderFromGraph(nodes, edges) : nodes;
  return [...ordered]
    .sort((a, b) => a.order - b.order)
    .map((node) => ({
      nodeId: node.nodeId,
      type: String(node.type),
      label: workflowNodeLabel(String(node.type)),
      order: node.order,
      lane: typeof node.lane === 'string' && node.lane.trim() ? node.lane.trim() : null,
      isLocked: node.isLocked === true,
    }));
}

export function showWorkflowPayload(args: {
  workflowId: string;
  ruleId: string;
  status: string;
  name?: string;
  brandName?: string;
  nodes?: WorkflowNodeLike[];
  edges?: WorkflowGraphEdge[];
  extra?: Record<string, unknown>;
}): string {
  return toolOk({
    action: 'show_workflow',
    workflowId: args.workflowId,
    ruleId: args.ruleId,
    status: args.status,
    name: cardWorkflowName(args.brandName, args.name),
    brandName: args.brandName ?? '',
    nodes: summarizeWorkflowNodes(args.nodes ?? [], args.edges ?? []),
    ...(args.extra ?? {}),
  });
}

/** One line per step for prompts: "1. Text  2. Branch  3. Adapt [tiktok, instagram] ...". */
export function describeWorkflowSteps(
  nodes: WorkflowNodeLike[],
  edges: WorkflowGraphEdge[] = [],
): string {
  const summary = summarizeWorkflowNodes(nodes, edges);
  const rows: { label: string; type: string; ids: string[]; lanes: string[] }[] = [];
  for (const node of summary) {
    const last = rows.at(-1);
    if (last && last.type === node.type && node.lane) {
      last.ids.push(node.nodeId);
      last.lanes.push(node.lane);
      continue;
    }
    rows.push({
      label: node.label,
      type: node.type,
      ids: [node.nodeId],
      lanes: node.lane ? [node.lane] : [],
    });
  }
  if (rows.length === 0) return '(no steps)';
  return rows
    .map(
      (row, i) =>
        `${i + 1}. ${row.label}${row.lanes.length ? ` [${row.lanes.join(', ')}]` : ''} (nodeId ${row.ids.join(', ')})`,
    )
    .join('\n');
}

/**
 * Blocks a second generate/apply while one is running, and requires an
 * explicit confirm before replacing a workflow that already exists.
 * Returns an observation string when the call must stop, otherwise null.
 */
export async function guardWorkflowReplace(
  workflowService: WorkflowService,
  ruleId: string,
  auth: TenancyAuth,
  confirmReplace: boolean,
): Promise<string | null> {
  const current = await workflowService.getWorkflowByRuleId(ruleId, auth);
  if (!current) return null;

  const status = String(current.workflow.status);
  if (status === WorkflowStatus.Generating || status === 'generating') {
    return toolError(
      'generation_in_progress',
      'A workflow is already being generated for this brand. Wait until it finishes before starting another.',
      {
        workflowId: current.workflow.workflowId,
        status,
        nodeTypes: current.nodes.map((node) => String(node.type)),
      },
    );
  }

  if (!confirmReplace) {
    return toolError(
      'workflow_exists',
      'A workflow already exists for this brand. If it was created earlier in this chat, or the user just wants a post, do not offer to replace it: use it (start_generation). Only when the user explicitly asked for a different or new workflow, ask them to confirm, then call again with confirmReplace true.',
      {
        workflowId: current.workflow.workflowId,
        status,
        nodeTypes: current.nodes.map((node) => String(node.type)),
      },
    );
  }

  return null;
}
