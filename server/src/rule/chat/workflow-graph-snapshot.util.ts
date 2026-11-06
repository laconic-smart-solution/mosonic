/**
 * Compact authoritative workflow graph for model context.
 * Derived from real nodes every turn — beats stale chat assumptions.
 * Rule: N image_generation nodes in a lane => N images in one run for that lane.
 */
import { workflowLanes } from '../capability.util';
import { normalizeLaneId } from '../../workflow/workflow-graph.util';

export type NodeLike = { type?: unknown; lane?: unknown; nodeId?: unknown };

export type LaneGraphRow = {
  lane: string;
  imageGeneration: number;
  /** Other node type counts on this lane (adapt, text_generation, …). */
  types: Record<string, number>;
};

export type WorkflowGraphSnapshot = {
  hasWorkflow: boolean;
  status?: string;
  /** Shared (no-lane) image_generation count. */
  sharedImageGeneration: number;
  lanes: LaneGraphRow[];
  /** Total image_generation nodes anywhere. */
  totalImageGeneration: number;
};

const IMAGE_RE = /image_generation|ImageGeneration/i;

function typeKey(t: unknown): string {
  const s = String(t ?? '').trim();
  if (IMAGE_RE.test(s)) return 'image_generation';
  if (/text_generation|TextGeneration/i.test(s)) return 'text_generation';
  if (/^adapt$|Adapt/i.test(s)) return 'adapt';
  if (/translation|Translation/i.test(s)) return 'translation';
  if (/branch|Branch/i.test(s)) return 'branch';
  return s || 'unknown';
}

/** Build snapshot from workflow nodes (and optional status). */
export function buildWorkflowGraphSnapshot(
  nodes: NodeLike[] | null | undefined,
  status?: string | null,
): WorkflowGraphSnapshot {
  if (!nodes || nodes.length === 0) {
    return {
      hasWorkflow: false,
      sharedImageGeneration: 0,
      lanes: [],
      totalImageGeneration: 0,
    };
  }
  const sharedImageGeneration = nodes.filter(
    (n) => !n.lane && IMAGE_RE.test(String(n.type ?? '')),
  ).length;
  const lanesMeta = workflowLanes(nodes);
  const laneIds = lanesMeta.map((l) => l.lane);
  const lanes: LaneGraphRow[] =
    laneIds.length > 0
      ? laneIds.map((lane) => {
          const onLane = nodes.filter(
            (n) => n.lane && normalizeLaneId(String(n.lane)) === lane,
          );
          const types: Record<string, number> = {};
          for (const n of onLane) {
            const k = typeKey(n.type);
            types[k] = (types[k] ?? 0) + 1;
          }
          // Shared images apply to every lane for run output.
          const imageGeneration =
            (types.image_generation ?? 0) + sharedImageGeneration;
          return { lane, imageGeneration, types };
        })
      : [
          {
            lane: 'shared',
            imageGeneration: nodes.filter((n) =>
              IMAGE_RE.test(String(n.type ?? '')),
            ).length,
            types: nodes.reduce(
              (acc, n) => {
                const k = typeKey(n.type);
                acc[k] = (acc[k] ?? 0) + 1;
                return acc;
              },
              {} as Record<string, number>,
            ),
          },
        ];
  const totalImageGeneration = nodes.filter((n) =>
    IMAGE_RE.test(String(n.type ?? '')),
  ).length;
  return {
    hasWorkflow: true,
    ...(status ? { status: String(status) } : {}),
    sharedImageGeneration,
    lanes,
    totalImageGeneration,
  };
}

/** Compact prompt block — structured facts, not an essay. */
export function renderWorkflowGraphSnapshot(snap: WorkflowGraphSnapshot): string {
  const lines = ['## Workflow graph (live; overrides earlier chat claims)'];
  if (!snap.hasWorkflow) {
    lines.push('Workflow: none yet. A run needs apply_default_workflow or generate_workflow first.');
    lines.push(
      'Rule: each image_generation node = 1 image per run; N nodes on a lane => N images in one run (mediaUrls).',
    );
    return lines.join('\n');
  }
  lines.push(
    `Workflow: present${snap.status ? ` (${snap.status})` : ''}. Lanes: ${
      snap.lanes.map((l) => l.lane).join(', ') || 'shared'
    }.`,
  );
  for (const l of snap.lanes) {
    const typeBits = Object.entries(l.types)
      .map(([t, n]) => `${t}=${n}`)
      .join(', ');
    lines.push(
      `- ${l.lane}: image_generation=${l.imageGeneration}${
        typeBits ? ` (${typeBits})` : ''
      } => ${l.imageGeneration} image(s) per run on this lane`,
    );
  }
  if (snap.sharedImageGeneration > 0 && snap.lanes.some((l) => l.lane !== 'shared')) {
    lines.push(
      `(${snap.sharedImageGeneration} shared image_generation node(s) counted on every lane.)`,
    );
  }
  lines.push(
    'Rule: N image_generation nodes in a lane => N images in one run for that lane. Adding nodes is willChange, not impossible.',
  );
  return lines.join('\n');
}

/**
 * Map preflight willChange lines to concrete tools for Yes→execute chains.
 */
export function willChangeLinesToTools(lines: readonly string[]): string[] {
  const tools: string[] = [];
  for (const line of lines) {
    if (/image step/i.test(line) || /translation step/i.test(line)) {
      tools.push('add_workflow_node');
    }
    if (/Post only to|set_workflow_channels|channel lane/i.test(line)) {
      tools.push('set_workflow_channels');
    }
  }
  if (tools.length > 0) tools.push('start_generation');
  return [...new Set(tools)];
}
