import { parseRequest } from '../capability.util';
import type { GoalAcceptance } from './session-state.types';

/**
 * Infer acceptance criteria from the user’s request text.
 * Used when setting/refreshing a make_post goal — not proof of completion.
 */
export function inferGoalAcceptance(userText: string): GoalAcceptance | undefined {
  const r = parseRequest(userText);
  const criteria: string[] = [];
  const channels = r.channels.length ? [...r.channels] : undefined;
  if (channels?.length) {
    criteria.push(`Draft for ${channels.join(', ')}`);
  }
  let imageCount: number | undefined;
  if (r.imagesPerChannel && r.imagesPerChannel > 0) {
    imageCount = r.imagesPerChannel;
    criteria.push(
      `${imageCount} distinct image${imageCount > 1 ? 's' : ''} attached in order`,
    );
  } else if (r.wantsImages) {
    criteria.push('At least one image on the draft');
  }
  const askPublish = /publish|go live|upload|post (it|this|now)/i.test(userText);
  if (askPublish) criteria.push('Ask before publishing');

  if (!criteria.length && !channels && !imageCount) return undefined;
  return {
    ...(channels ? { channels } : {}),
    ...(imageCount ? { imageCount } : {}),
    ...(askPublish ? { askPublish: true } : {}),
    criteria,
  };
}

/**
 * Saving preferences / update_rule alone never completes a create/generate goal.
 * Returns a short reason when the turn looks like a false completion.
 */
export function falseCompletionOnSetupOnly(input: {
  goalKind?: string;
  userText: string;
  toolNamesThisTurn: readonly string[];
}): string | null {
  const tools = new Set(input.toolNamesThisTurn);
  const setupOnly = [...tools].every((n) =>
    ['update_rule', 'set_workflow_channels', 'add_workflow_node', 'remove_workflow_node', 'ask_user', 'get_rule', 'list_workflows', 'remember'].includes(n),
  );
  const ranSetup = ['update_rule', 'set_workflow_channels', 'add_workflow_node'].some((n) =>
    tools.has(n),
  );
  const ranGenerate = ['start_generation', 'generate_more_image', 'generate_more_adapt'].some((n) =>
    tools.has(n),
  );
  if (ranGenerate || !ranSetup || !setupOnly) return null;

  const wantsCreate =
    input.goalKind === 'make_post' ||
    /create|make|generate|write|post|draft|images?/i.test(input.userText);
  if (!wantsCreate) return null;
  if (tools.has('ask_user')) return null; // plan/confirm in progress is fine

  return 'Goal not done: preferences/workflow were updated but no draft was started. Continue with the plan (add nodes / start_generation) or ask to confirm.';
}
