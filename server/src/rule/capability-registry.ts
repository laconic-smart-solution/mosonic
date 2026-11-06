/**
 * Versioned capability contracts shared by model context, preflight, and
 * goal verification. Derived from runner/upload reality (not a giant static
 * prompt). Keep in sync with capability.util preflight + upload-lane-media.
 */
import { workflowLanes } from './capability.util';

export const CAPABILITY_REGISTRY_VERSION = 1;

export type CapabilityAvailability =
  | 'executable_now'
  | 'reachable_after_prep'
  | 'not_supported';

export type CapabilityContract = {
  id: string;
  purpose: string;
  /** Tools that implement this capability (when available). */
  toolNames: string[];
  preconditions: string[];
  effects: string[];
  /** Prep steps that move reachable_after_prep -> executable_now. */
  prep?: string[];
  approvalRequired?: boolean;
  costsCredits?: boolean;
  limitNotes?: string[];
};

/** Core ops the chat agent plans against. */
export const CAPABILITY_CONTRACTS: readonly CapabilityContract[] = [
  {
    id: 'update_preferences',
    purpose:
      'Save brand preferences (style, audience, etc.). Never produces a draft.',
    toolNames: ['update_rule'],
    preconditions: ['brand exists'],
    effects: ['rule fields updated'],
    costsCredits: false,
  },
  {
    id: 'set_channels',
    purpose: 'Include/exclude distribution lanes on the workflow.',
    toolNames: ['set_workflow_channels'],
    preconditions: ['workflow exists'],
    effects: ['workflow lanes match requested channels'],
    prep: ['apply_default_workflow or generate_workflow if none'],
    costsCredits: false,
  },
  {
    id: 'add_image_steps',
    purpose:
      'Add N image_generation nodes on a lane so one run produces N images (1 image per node).',
    toolNames: ['add_workflow_node'],
    preconditions: ['workflow exists', 'lane exists or will be added'],
    effects: ['lane image step count increases'],
    limitNotes: [
      'Each image_generation node produces exactly 1 image per run',
      'Upload aggregates all lane image URLs into ordered mediaUrls',
    ],
    costsCredits: false,
  },
  {
    id: 'start_run',
    purpose: 'Start a generation run for the current workflow revision.',
    toolNames: ['start_generation'],
    preconditions: ['workflow exists', 'required image/text nodes ready'],
    effects: ['pipeline queued', 'draft version will appear when run finishes'],
    approvalRequired: true,
    costsCredits: true,
    prep: ['add missing image/translation steps', 'set channels'],
  },
  {
    id: 'generate_more_image',
    purpose: 'Add extra images to an existing draft after a run (costs credits).',
    toolNames: ['generate_more_image'],
    preconditions: ['latest draft exists'],
    effects: ['additional images on content'],
    costsCredits: true,
    limitNotes: [
      'Prefer N image nodes in one run when the request is known up front',
    ],
  },
  {
    id: 'inspect_upload',
    purpose:
      'Read ordered mediaUrls / captions / channel readiness on the upload draft.',
    toolNames: ['get_upload', 'preview_upload'],
    preconditions: [
      'content exists (approve or publish path creates upload row)',
    ],
    effects: ['observation only'],
    costsCredits: false,
  },
  {
    id: 'publish',
    purpose: 'Publish an approved upload to selected channels.',
    toolNames: ['publish_now'],
    preconditions: ['upload ready', 'channels connected', 'user approval'],
    effects: ['provider publish attempted'],
    approvalRequired: true,
    costsCredits: false,
  },
] as const;

export type RegistryContext = {
  nodes: Array<{ type?: unknown; lane?: unknown }> | null;
  brandChannels: string[];
  hasDraft: boolean;
  activeRun: boolean;
};

export type ResolvedCapability = {
  id: string;
  availability: CapabilityAvailability;
  reasons: string[];
  contract: CapabilityContract;
};

export function getContract(id: string): CapabilityContract | undefined {
  return CAPABILITY_CONTRACTS.find((c) => c.id === id);
}

/** Resolve executable_now vs reachable_after_prep from live workflow facts. */
export function resolveCapability(
  id: string,
  ctx: RegistryContext,
): ResolvedCapability | undefined {
  const contract = getContract(id);
  if (!contract) return undefined;
  const reasons: string[] = [];

  if (id === 'update_preferences') {
    return { id, availability: 'executable_now', reasons, contract };
  }

  if (!ctx.nodes) {
    if (
      id === 'set_channels' ||
      id === 'add_image_steps' ||
      id === 'start_run'
    ) {
      return {
        id,
        availability: 'reachable_after_prep',
        reasons: [
          'No workflow yet — apply_default_workflow or generate_workflow first',
        ],
        contract,
      };
    }
  }

  if (id === 'add_image_steps' || id === 'set_channels') {
    return { id, availability: 'executable_now', reasons, contract };
  }

  if (id === 'start_run') {
    if (ctx.activeRun) {
      return {
        id,
        availability: 'reachable_after_prep',
        reasons: ['A run is already active — wait or cancel_pipeline'],
        contract,
      };
    }
    if (!ctx.nodes) {
      return {
        id,
        availability: 'reachable_after_prep',
        reasons: ['Need a workflow first'],
        contract,
      };
    }
    return { id, availability: 'executable_now', reasons, contract };
  }

  if (
    id === 'generate_more_image' ||
    id === 'inspect_upload' ||
    id === 'publish'
  ) {
    if (!ctx.hasDraft) {
      return {
        id,
        availability: 'reachable_after_prep',
        reasons: ['No draft yet — start_generation first'],
        contract,
      };
    }
    return { id, availability: 'executable_now', reasons, contract };
  }

  return { id, availability: 'executable_now', reasons, contract };
}

/**
 * How many image_generation nodes a lane needs for N images in one run.
 * Returns { have, need, shortfall } for the primary target lane (or shared).
 */
export function imageStepGap(
  nodes: Array<{ type?: unknown; lane?: unknown }> | null,
  channel: string | undefined,
  need: number,
): { have: number; need: number; shortfall: number } {
  if (!nodes || need <= 0) return { have: 0, need, shortfall: need };
  const lanes = workflowLanes(nodes);
  const have = channel
    ? (lanes.find((l) => l.lane === channel)?.images ?? 0)
    : nodes.filter((n) =>
        /image_generation|ImageGeneration/i.test(String(n.type ?? '')),
      ).length;
  return { have, need, shortfall: Math.max(0, need - have) };
}

/** Compact registry block for prompts — facts only, no invented limits. */
export function buildRegistrySummary(ctx: RegistryContext): string {
  const lines = [`## Capability registry v${CAPABILITY_REGISTRY_VERSION}`];
  for (const c of CAPABILITY_CONTRACTS) {
    const r = resolveCapability(c.id, ctx);
    if (!r) continue;
    const note = r.reasons.length ? ` (${r.reasons[0]})` : '';
    lines.push(`- ${c.id}: ${r.availability}${note} — ${c.purpose}`);
  }
  if (ctx.nodes) {
    const lanes = workflowLanes(ctx.nodes);
    if (lanes.length) {
      lines.push(
        `Image steps now: ${lanes
          .map((l) => `${l.lane}=${l.images}`)
          .join(', ')} (1 image per step; N steps → N mediaUrls).`,
      );
    }
  }
  return lines.join('\n');
}
