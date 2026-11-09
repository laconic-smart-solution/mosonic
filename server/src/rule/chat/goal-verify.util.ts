import type { GoalAcceptance } from './session-state.types';
import { falseCompletionOnSetupOnly } from './goal-acceptance.util';

/**
 * Deterministic postcondition outcomes for GoalAcceptance.
 * No LLM calls — code checks artifacts / tool evidence only.
 */
export type GoalVerifyStatus =
  | 'completed'
  | 'awaiting_approval'
  | 'awaiting_input'
  | 'blocked'
  | 'failed'
  | 'in_progress';

export type GoalVerifyResult = {
  status: GoalVerifyStatus;
  /** Unmet acceptance criteria (empty when completed). */
  unmet: string[];
  evidence: string;
};

export type GoalVerifyObservation = {
  name: string;
  result: string;
};

export type GoalVerifyFacts = {
  hasDraft?: boolean;
  draftHasImage?: boolean;
  activeRun?: boolean;
  /** Max ordered mediaUrls seen on any included upload channel. */
  mediaUrlCount?: number;
  uploadChannels?: string[];
  brandReady?: boolean;
  listingFactsPresent?: boolean;
};

/** Largest mediaUrls length found in get_upload / preview_upload observations. */
export function mediaCountFromObservations(
  observations: readonly GoalVerifyObservation[],
): number {
  let max = 0;
  for (const o of observations) {
    if (o.name !== 'get_upload' && o.name !== 'preview_upload') continue;
    try {
      const parsed = JSON.parse(o.result) as {
        channels?: Array<{ mediaUrls?: unknown; mediaUrl?: unknown; included?: boolean }>;
      };
      for (const c of parsed.channels ?? []) {
        if (c.included === false) continue;
        const list = Array.isArray(c.mediaUrls) ? c.mediaUrls.filter(Boolean) : [];
        const n = list.length || (c.mediaUrl ? 1 : 0);
        if (n > max) max = n;
      }
    } catch {
      // ignore non-JSON
    }
  }
  return max;
}

function ranOk(
  observations: readonly GoalVerifyObservation[],
  name: string,
): boolean {
  return observations.some((o) => {
    if (o.name !== name) return false;
    if (/^\s*\{/.test(o.result)) {
      try {
        const p = JSON.parse(o.result) as { ok?: unknown };
        return p.ok !== false;
      } catch {
        return true;
      }
    }
    return !/^\s*(Not run|Unknown tool|\{"ok":false)/i.test(o.result);
  });
}

/**
 * Verify GoalAcceptance against tool evidence + optional live facts.
 * Preference-only turns (no acceptance / no make_post) → completed.
 */
export function verifyGoalAcceptance(input: {
  goalKind?: string;
  acceptance?: GoalAcceptance;
  userText?: string;
  toolNamesThisTurn: readonly string[];
  observations: readonly GoalVerifyObservation[];
  facts?: GoalVerifyFacts;
}): GoalVerifyResult {
  const { acceptance, goalKind } = input;
  const tools = input.toolNamesThisTurn;
  const obs = input.observations;

  // No create/generate goal → preference / Q&A may finish freely.
  if (!acceptance && goalKind !== 'make_post' && goalKind !== 'publish') {
    return { status: 'completed', unmet: [], evidence: 'no acceptance criteria' };
  }

  const falseSetup = falseCompletionOnSetupOnly({
    goalKind,
    userText: input.userText ?? '',
    toolNamesThisTurn: tools,
  });
  if (falseSetup) {
    return {
      status: 'in_progress',
      unmet: acceptance?.criteria?.length
        ? [...acceptance.criteria]
        : ['Start or continue draft generation'],
      evidence: falseSetup,
    };
  }

  if (tools.includes('ask_user') || obs.some((o) => o.name === 'ask_user')) {
    return {
      status: 'awaiting_input',
      unmet: acceptance?.criteria ?? [],
      evidence: 'ask_user pending',
    };
  }

  const unmet: string[] = [];

  if (input.facts?.brandReady === false) {
    unmet.push('Brand profile completed and READY');
  }

  if (acceptance?.requiresListingOffer && input.facts?.listingFactsPresent === false) {
    unmet.push('Specific room/listing facts verified');
  }
  const mediaFromObs = mediaCountFromObservations(obs);
  const mediaCount = Math.max(
    mediaFromObs,
    input.facts?.mediaUrlCount ?? 0,
    input.facts?.draftHasImage ? 1 : 0,
  );

  if (acceptance?.channels?.length) {
    const uploadCh = new Set(
      (input.facts?.uploadChannels ?? []).map((c) => c.toLowerCase()),
    );
    // Without upload facts, channel check is deferred (in_progress after run).
    if (uploadCh.size) {
      for (const ch of acceptance.channels) {
        if (!uploadCh.has(ch.toLowerCase())) {
          unmet.push(`Draft channel ${ch}`);
        }
      }
    } else if (!input.facts?.hasDraft && !ranOk(obs, 'start_generation')) {
      unmet.push(`Draft for ${acceptance.channels.join(', ')}`);
    }
  }

  if (acceptance?.imageCount && acceptance.imageCount > 0) {
    if (mediaCount < acceptance.imageCount) {
      if (
        ranOk(obs, 'start_generation') ||
        input.facts?.activeRun ||
        tools.includes('start_generation')
      ) {
        unmet.push(
          `${acceptance.imageCount} images (run started; ${mediaCount} mediaUrls so far)`,
        );
      } else {
        unmet.push(
          `${acceptance.imageCount} distinct images (have ${mediaCount})`,
        );
      }
    }
  } else if (
    (goalKind === 'make_post' || acceptance) &&
    !input.facts?.hasDraft &&
    !ranOk(obs, 'start_generation') &&
    !tools.includes('start_generation')
  ) {
    // make_post without explicit image count still needs a draft/run.
    if (acceptance?.criteria?.length || goalKind === 'make_post') {
      // Only force if criteria mention draft/images or we had setup tools.
      const setupish = tools.some((n) =>
        [
          'update_rule',
          'set_workflow_channels',
          'add_workflow_node',
          'remove_workflow_node',
          'apply_default_workflow',
        ].includes(n),
      );
      if (setupish) unmet.push('Draft started (start_generation)');
    }
  }

  if (acceptance?.askPublish) {
    const published = tools.includes('publish_now') && ranOk(obs, 'publish_now');
    if (published) {
      return {
        status: 'completed',
        unmet: [],
        evidence: 'published after askPublish goal',
      };
    }
    // Draft ready + askPublish: completion means we asked, not that we published.
    if (
      unmet.length === 0 &&
      (input.facts?.hasDraft || mediaCount > 0) &&
      !tools.includes('ask_user')
    ) {
      // Still need to ask — treat as awaiting_approval if preview ran, else unmet.
      if (ranOk(obs, 'preview_upload') || ranOk(obs, 'get_upload')) {
        return {
          status: 'awaiting_approval',
          unmet: ['Ask before publishing'],
          evidence: 'draft ready; publish not confirmed',
        };
      }
    }
  }

  if (unmet.length) {
    const failed = obs.some((o) => {
      try {
        const p = JSON.parse(o.result) as { ok?: unknown };
        return p.ok === false;
      } catch {
        return false;
      }
    });
    return {
      status: failed && !ranOk(obs, 'start_generation') ? 'failed' : 'in_progress',
      unmet,
      evidence: unmet.join('; '),
    };
  }

  if (goalKind === 'make_post' || acceptance) {
    // Satisfied only when we have a draft/run evidence for create goals.
    if (
      input.facts?.hasDraft ||
      mediaCount > 0 ||
      ranOk(obs, 'start_generation') ||
      input.facts?.activeRun
    ) {
      // Partial generation (run started, images not all there) already pushed unmet.
      return {
        status: acceptance?.askPublish ? 'awaiting_approval' : 'completed',
        unmet: acceptance?.askPublish ? ['Ask before publishing'] : [],
        evidence: ranOk(obs, 'start_generation')
          ? 'generation started'
          : 'draft evidence present',
      };
    }
  }

  return {
    status: 'completed',
    unmet: [],
    evidence: 'acceptance empty or satisfied',
  };
}

/** True when the tool loop must not treat the turn as done. */
export function shouldForceContinueOnGoal(result: GoalVerifyResult): boolean {
  return (
    result.status === 'in_progress' ||
    result.status === 'failed' ||
    result.status === 'blocked'
  );
}

export function goalContinueInstruction(unmet: readonly string[]): string {
  const list = unmet.length ? unmet.join('; ') : 'goal acceptance not met';
  return `(Internal note, not from the user.) Goal not complete. Still unmet: ${list}. Do not claim the request is done. Call the next tool toward these criteria (add image steps / set channels / start_generation / get_upload to verify). If you need a user choice, use ask_user. Prefer tools over a done reply.`;
}
