import { parseRequest, preflightRequest } from '../capability.util';
import { toolError } from '../tools/tool-error.util';

/**
 * Block ask_user cards that frame a reachable willChange setup as impossible.
 * Deterministic — no LLM.
 */

const IMPOSSIBLE_CLAIM =
  /\b(can'?t|cannot|impossible|not possible|not supported|unsupported|unable to|won'?t be able|no way to)\b/i;
const WAIT_WORKAROUND =
  /\b(wait (until|for|till)|only (after|once|when)|workaround|come back later|not (yet )?available)\b/i;
const MULTI_IMAGE =
  /\b(\d+|two|three|four|five|six)\s+(?:of\s+)?(?:[a-z-]+\s+){0,2}(images?|photos?|pictures?)\b/i;

export type FalseImpossibilityInput = {
  question: string;
  options?: ReadonlyArray<{ id?: string; label?: string }>;
  plan?: {
    willChange?: readonly string[];
    notPossible?: readonly string[];
  } | null;
  /** When set, re-check preflight against live nodes + request text. */
  nodes?: Array<{ type?: unknown; lane?: unknown }> | null;
  userText?: string;
};

function optionBlob(
  options: FalseImpossibilityInput['options'],
): string {
  return (options ?? [])
    .map((o) => `${o.id ?? ''} ${o.label ?? ''}`)
    .join(' | ');
}

function willChangeReachable(plan: {
  willChange?: readonly string[];
  notPossible?: readonly string[];
}): boolean {
  const will = plan.willChange ?? [];
  const not = plan.notPossible ?? [];
  return will.length > 0 && not.length === 0;
}

function claimsImpossible(question: string, optionsText: string): boolean {
  const blob = `${question}\n${optionsText}`;
  return IMPOSSIBLE_CLAIM.test(blob) || WAIT_WORKAROUND.test(blob);
}

/**
 * Returns a toolError observation string when ask_user must be blocked, else null.
 */
export function falseImpossibilityAskBlock(
  input: FalseImpossibilityInput,
): string | null {
  const question = (input.question ?? '').trim();
  const optText = optionBlob(input.options);
  const claims = claimsImpossible(question, optText);

  let reachable = input.plan ? willChangeReachable(input.plan) : false;
  let plan = input.plan ?? undefined;

  if (!reachable && input.nodes && input.userText) {
    const pf = preflightRequest({
      request: parseRequest(input.userText),
      nodes: input.nodes,
      attachedImages: 0,
    });
    plan = pf;
    reachable = willChangeReachable(pf);
  }

  if (!reachable) return null;

  // Multi-image willChange must never be sold as impossible / wait-only.
  const willText = (plan?.willChange ?? []).join(' ');
  const multiViaNodes =
    /image steps?/i.test(willText) ||
    (MULTI_IMAGE.test(input.userText ?? '') && /image/i.test(willText));

  if (!claims && !multiViaNodes) return null;
  if (!claims && multiViaNodes) {
    // Still block if options only offer "wait" / "can't" without a Yes-to-change path.
    const hasYes = /\byes\b/i.test(optText);
    if (hasYes && !IMPOSSIBLE_CLAIM.test(question) && !WAIT_WORKAROUND.test(optText)) {
      return null;
    }
    if (!IMPOSSIBLE_CLAIM.test(`${question}\n${optText}`) && !WAIT_WORKAROUND.test(optText)) {
      return null;
    }
  }

  if (!claims) return null;

  return toolError(
    'false_impossibility',
    'Do not tell the user this is impossible. The live preflight says it is reachable by changing the workflow (willChange). Call ask_user again with the capability plan (youAskedFor / willChange / notPossible=[]) and Yes/Change — or run the willChange tools now, then start_generation.',
    {
      plan: plan
        ? {
            youAskedFor: (plan as { youAskedFor?: unknown }).youAskedFor ?? [],
            willChange: [...(plan.willChange ?? [])],
            notPossible: [...(plan.notPossible ?? [])],
          }
        : undefined,
      nextTools: willText.match(/image step/i)
        ? ['add_workflow_node', 'start_generation']
        : ['start_generation'],
    },
  );
}
