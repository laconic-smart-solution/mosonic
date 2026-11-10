import { ASK_USER_TOOL_NAME } from './ask-user.tool';
import { parseRequest } from '../capability.util';
import { toolError } from './tool-error.util';
import type { Approval } from '../chat/session-state.types';

/**
 * Tools that change state (rule, memory, workflow, content, pipelines).
 * runToolCallingLoop counts these across every model response in a turn. The
 * default cap is 1 (mutationLimit); the main chat turn passes
 * CHAT_MUTATIONS_PER_TURN. Extra calls get one_mutation_per_turn instead.
 * Add new write tools here.
 */
/** Change tools the main chat turn may run for one request (prompt: "up to 4 change tools"). */
export const CHAT_MUTATIONS_PER_TURN = 4;
/**
 * Model calls per round on the main chat turn (was the loop default 6).
 * Reads only spend these, so they are freer than changes.
 */
export const CHAT_ITERATIONS_PER_ROUND = 8;
/**
 * Extra internal rounds in one user message while planned changes remain and
 * no human gate (ask_user, OAuth, confirmation, a question) was hit. Each
 * round gets a fresh CHAT_MUTATIONS_PER_TURN / CHAT_ITERATIONS_PER_ROUND, so
 * one message tops out at 3 rounds = 12 changes / 24 model calls.
 */
export const CHAT_CONTINUE_ROUNDS = 2;

export const MUTATING_TOOL_NAMES: ReadonlySet<string> = new Set([
  'update_rule',
  'create_rule_from_intake',
  'remember',
  'forget',
  'forget_all',
  'reorder_workflow_nodes',
  'remove_workflow_node',
  'add_workflow_node',
  'set_workflow_channels',
  'generate_workflow',
  'apply_default_workflow',
  'update_node_config',
  'set_video_node_look',
  'start_generation',
  'save_content',
  'approve_content',
  'reject_content',
  'rerun_content_node',
  'generate_more_image',
  'generate_more_translation',
  'generate_more_summary',
  'generate_more_adapt',
  'generate_presenter_video',
  'generate_cinematic_video',
  'cancel_pipeline',
  'publish_now',
  'schedule_publish',
  'retry_publish',
  'edit_content',
  'add_upload_media',
  'remove_upload_media',
  'edit_upload_channel',
  'reschedule_publish',
  'cancel_schedule',
  'apply_rule_suggestion',
  'start_channel_oauth',
]);

/** Tools that only run when the user's latest message confirmed an ask_user prompt. */
export const CONFIRMATION_REQUIRED_TOOL_NAMES: ReadonlySet<string> = new Set([
  // Video renders are expensive (HeyGen presenter / cinematic): never start one unconfirmed.
  'generate_presenter_video',
  'generate_cinematic_video',
  'approve_content',
  'reject_content',
  'publish_now',
  'schedule_publish',
  'retry_publish',
  'remove_upload_media',
  'reschedule_publish',
  'cancel_schedule',
  'apply_rule_suggestion',
]);

export const NEGATIVE_ANSWERS: ReadonlySet<string> = new Set([
  'no',
  'cancel',
  'stop',
  'not now',
  'nope',
  'not yet',
  'later',
  'skip',
]);

/** The client's chip payload: `User choice: <id>[, <id>] (<label>[, <label>])` (see client parse-ask-user.ts). */
const USER_CHOICE_PATTERN = /^user choice:\s*(.+?)\s*\((.*)\)\s*$/i;

/**
 * Reads the selected option ids/labels out of a user message. Accepts the
 * client chip format and a bare typed id or label. Returns lower-cased values.
 */
export function parseUserChoice(
  content: string,
): { ids: string[]; labels: string[] } | null {
  const text = content.trim();
  if (!text) return null;
  const match = USER_CHOICE_PATTERN.exec(text);
  if (!match) {
    const bare = text.toLowerCase();
    return { ids: [bare], labels: [bare] };
  }
  const split = (value: string) =>
    value
      .split(',')
      .map((v) => v.trim().toLowerCase())
      .filter(Boolean);
  return { ids: split(match[1]), labels: split(match[2]) };
}

type AskUserPayload = {
  action?: unknown;
  confirmFor?: unknown;
  options?: { id?: unknown; label?: unknown }[];
};

function lastAskUserOptions(
  steps: unknown,
): { id: string; label: string }[] | null {
  if (!Array.isArray(steps)) return null;
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i] as {
      type?: unknown;
      name?: unknown;
      result?: unknown;
    };
    if (step?.type === 'observation' && typeof step.result === 'string') {
      try {
        const payload = JSON.parse(step.result) as AskUserPayload;
        // Real ask_user calls, or the confirmation prompt the chat guard
        // produces in place of a blocked approve/reject (confirmFor set).
        const isPrompt =
          payload?.action === 'ask_user' &&
          (step.name === ASK_USER_TOOL_NAME ||
            typeof payload.confirmFor === 'string');
        if (!isPrompt) {
          if (step.name === ASK_USER_TOOL_NAME) return null;
          continue;
        }
        if (!Array.isArray(payload.options)) {
          return null;
        }
        return payload.options.map((o) => ({
          id: (typeof o.id === 'string' ? o.id : '').trim().toLowerCase(),
          label: (typeof o.label === 'string' ? o.label : '')
            .trim()
            .toLowerCase(),
        }));
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * True when the turn is the user's answer to an ask_user prompt and the
 * answer is a non-negative option. Rules:
 * - the newest stored message must be the user's (this turn's input),
 * - the assistant message right before it must end with an ask_user observation,
 * - the user's text must name that prompt's options, either as the client chip
 *   payload `User choice: <id> (<label>)` or as a bare id/label, and none of
 *   the picked options may be a "no"/"cancel" one.
 * Free-text "yes" without a preceding ask_user does not count.
 */
export function isConfirmedByUser(
  history: { role: string; content: string; steps?: unknown }[],
): boolean {
  if (history.length < 2) return false;
  const latest = history[history.length - 1];
  const previous = history[history.length - 2];
  if (latest.role !== 'user' || previous.role !== 'assistant') return false;
  const options = lastAskUserOptions(previous.steps);
  if (!options || options.length === 0) return false;
  const choice = parseUserChoice(latest.content);
  if (!choice || choice.ids.length === 0) return false;
  const picked = choice.ids.map(
    (id, index) =>
      options.find((o) => o.id === id) ??
      options.find((o) => o.label === id) ??
      options.find((o) => o.label === choice.labels[index]),
  );
  if (picked.some((o) => !o)) return false;
  return picked.every(
    (o) => !!o && !NEGATIVE_ANSWERS.has(o.id) && !NEGATIVE_ANSWERS.has(o.label),
  );
}

const CONFIRMATION_QUESTIONS: Record<string, string> = {
  approve_content: 'Approve this draft?',
  reject_content: 'Reject this draft?',
  publish_now: 'Publish this draft now?',
  schedule_publish: 'Schedule this draft?',
  retry_publish: 'Retry publishing this post?',
  remove_upload_media: 'Remove this media from the post?',
  reschedule_publish: 'Move the scheduled post to the new time?',
  cancel_schedule: 'Cancel the scheduled post?',
  apply_rule_suggestion: 'Apply this brand improvement?',
  generate_presenter_video: 'Make a presenter video for this draft? It uses video credits.',
  generate_cinematic_video: 'Make a cinematic video for this draft? It uses video credits.',
};

const VIDEO_PREVIEW_KEYS: [string, string][] = [
  ['duration', 'Duration (s)'],
  ['cinematicMode', 'Mode'],
  ['heygenVideoMode', 'Video mode'],
  ['heygenVoiceId', 'Voice'],
  ['orientation', 'Orientation'],
  ['heygenAvatarId', 'Look'],
  ['aspectRatio', 'Aspect'],
  ['prompt', 'Scene'],
];

/** Preview before a generate-more video: the confirm card lists what will render. */ function videoPreviewQuestion(toolName: string, args: Record<string, unknown> = {}): string | null {
  if (toolName !== 'generate_presenter_video' && toolName !== 'generate_cinematic_video') return null;
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const [key, label] of VIDEO_PREVIEW_KEYS) {
    const v = args[key];
    if (seen.has(label) || v === undefined || v === null || v === '') continue;
    seen.add(label);
    lines.push(`- ${label}: ${String(v).slice(0, 80)}`);
  }
  if (!lines.length) lines.push('- Settings: from the workflow video step (look, voice, duration)');
  return [CONFIRMATION_QUESTIONS[toolName], ...lines].join('\n');
}

/**
 * Observation used in place of a blocked approve/reject call. It is an
 * ask_user prompt (the loop stops and the client renders the confirmation
 * card) that also carries the guard code and reason, so the turn never ends
 * with "tap Yes" text and no buttons. `confirmFor` lets isConfirmedByUser
 * accept the user's click on it next turn.
 */
export function confirmationPromptFor(
  toolName: string,
  args: Record<string, unknown> = {},
): string {
  if (toolName === 'fetch_website_assets') {
    const url = typeof args.url === 'string' ? args.url.trim() : '';
    return JSON.stringify({
      ok: false,
      code: 'confirmation_required',
      action: 'ask_user',
      type: 'single',
      confirmFor: toolName,
      url,
      question: 'Use this site for your brand assets?',
      message: `Nothing was fetched yet. If the user picks Use it, call fetch_website_assets with ${url || 'that URL'}; on Skip, fetch nothing.`,
      options: [
        { id: 'use', label: 'Use it' },
        { id: 'skip', label: 'Skip' },
      ],
    });
  }
  return JSON.stringify({
    ok: false,
    code: 'confirmation_required',
    action: 'ask_user',
    type: 'yes_no',
    confirmFor: toolName,
    question: videoPreviewQuestion(toolName, args) ?? CONFIRMATION_QUESTIONS[toolName] ?? `Go ahead with ${toolName}?`,
    message:
      "I need your confirmation before I do this. Tap Yes to continue, or No to leave it as it is.",
    options: [
      { id: 'yes', label: 'Yes' },
      { id: 'no', label: 'No' },
    ],
  });
}

/** Tools a "connect the account first" detour may use between a confirmation and its action. */
export const CONNECT_DETOUR_TOOLS: ReadonlySet<string> = new Set([
  'check_channel_auth',
  'start_channel_oauth',
  'list_channels',
]);
const DETOUR_READ_TOOLS: ReadonlySet<string> = new Set([
  ...CONNECT_DETOUR_TOOLS,
  ASK_USER_TOOL_NAME,
  'get_upload',
  'get_content',
  'list_contents',
]);
export const MAX_CONNECT_DETOUR_TURNS = 3;

type HistoryRow = { role: string; content: string; steps?: unknown };
type StepRow = {
  type?: unknown;
  name?: unknown;
  args?: unknown;
  toolCallId?: unknown;
  result?: unknown;
};

/** A confirmed action whose run was interrupted by connecting an account. */
export type CarriedConfirmation = {
  toolName: string;
  args: Record<string, unknown>;
  /** Channels the detour checked or connected. */
  detourChannels: string[];
};

function stepRows(steps: unknown): StepRow[] {
  return Array.isArray(steps) ? (steps as StepRow[]) : [];
}

function parseJson(text: unknown): Record<string, unknown> | null {
  if (typeof text !== 'string') return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** True when the message (chip or typed) names a no/cancel/skip answer. */
export function isNegativeReply(content: string): boolean {
  const choice = parseUserChoice(content);
  if (!choice) return false;
  return [...choice.ids, ...choice.labels].some((v) => NEGATIVE_ANSWERS.has(v));
}

/** The tool a confirmation card in these steps was asking about, with the blocked call's args. */
function confirmationCardIn(steps: unknown): { toolName: string; args: Record<string, unknown> } | null {
  const rows = stepRows(steps);
  for (let i = rows.length - 1; i >= 0; i--) {
    const step = rows[i];
    if (step?.type !== 'observation') continue;
    const payload = parseJson(step.result);
    if (payload?.action !== 'ask_user') continue;
    if (typeof payload.confirmFor !== 'string') return null;
    const toolName = payload.confirmFor;
    const action = rows.find(
      (s) =>
        s?.type === 'action' &&
        s.name === toolName &&
        (step.toolCallId === undefined || s.toolCallId === step.toolCallId),
    );
    const args =
      action?.args && typeof action.args === 'object'
        ? (action.args as Record<string, unknown>)
        : {};
    return { toolName, args };
  }
  return null;
}

/**
 * Detour turn = only connect/read tools, plus failed attempts at a
 * confirmation-required tool (e.g. publish_now before the account was
 * connected). Returns the channels it touched, or null when the turn did
 * anything else.
 */
function connectDetourChannels(steps: unknown): { channels: string[]; connectTools: number; ranTools: Map<string, boolean> } | null {
  const rows = stepRows(steps);
  const channels: string[] = [];
  let connectTools = 0;
  const ranTools = new Map<string, boolean>();
  for (const step of rows) {
    if (step?.type === 'observation') {
      if (typeof step.name !== 'string' || !CONFIRMATION_REQUIRED_TOOL_NAMES.has(step.name)) continue;
      const payload = parseJson(step.result);
      const failed = payload?.ok === false;
      ranTools.set(step.name, (ranTools.get(step.name) ?? false) || !failed);
      continue;
    }
    if (step?.type !== 'action' || typeof step.name !== 'string') continue;
    if (CONFIRMATION_REQUIRED_TOOL_NAMES.has(step.name)) continue;
    if (!DETOUR_READ_TOOLS.has(step.name)) return null;
    if (CONNECT_DETOUR_TOOLS.has(step.name)) {
      connectTools += 1;
      const args = (step.args ?? {}) as Record<string, unknown>;
      const channel = typeof args.channel === 'string' ? args.channel : typeof args.platform === 'string' ? args.platform : '';
      if (channel.trim()) channels.push(channel.trim().toLowerCase());
    }
  }
  return { channels, connectTools, ranTools };
}

/**
 * The user said yes to a confirmation card (publish/schedule/...), then the
 * AI had to connect an account first (check_channel_auth / start_channel_oauth,
 * maybe a "connect now?" question). When the user comes back ("done"), that
 * yes still stands for the same action, so they are not asked twice.
 *
 * Walks back from the latest user message over at most 3 detour turns (only
 * connect/read tools, no other change, the confirmed tool never succeeded,
 * no "no"/"cancel" from the user in between) to the turn whose card the user
 * confirmed. Returns null when there was no detour (isConfirmedByUser covers
 * that) or anything else happened in between.
 */
export function carriedConfirmation(history: HistoryRow[]): CarriedConfirmation | null {
  const latest = history[history.length - 1];
  if (!latest || latest.role !== 'user' || isNegativeReply(latest.content)) return null;
  const detourChannels: string[] = [];
  let connectTools = 0;
  const ranInDetour = new Map<string, boolean>();
  let detours = 0;
  // i = an assistant turn, i + 1 = the user's reply to it.
  for (let i = history.length - 2; i >= 1; i -= 2) {
    const assistant = history[i];
    const reply = history[i + 1];
    if (assistant.role !== 'assistant' || reply.role !== 'user') return null;
    const card = confirmationCardIn(assistant.steps);
    if (card) {
      if (detours === 0 || connectTools === 0) return null;
      if (ranInDetour.get(card.toolName)) return null;
      if (!isConfirmedByUser(history.slice(0, i + 2))) return null;
      return { toolName: card.toolName, args: card.args, detourChannels: [...new Set(detourChannels)] };
    }
    if (detours >= MAX_CONNECT_DETOUR_TURNS) return null;
    const detour = connectDetourChannels(assistant.steps);
    if (!detour) return null;
    if (isNegativeReply(reply.content)) return null;
    detours += 1;
    connectTools += detour.connectTools;
    detourChannels.push(...detour.channels);
    for (const [name, ran] of detour.ranTools) {
      ranInDetour.set(name, (ranInDetour.get(name) ?? false) || ran);
    }
  }
  return null;
}

function normalizedChannels(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const out = value
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  return out.length ? out : null;
}

function argValue(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = typeof value === 'string' ? value.trim() : JSON.stringify(value);
  return text ? text : undefined;
}

/**
 * True when this call is the same action on the same target the user
 * confirmed before the connect detour. contentId falls back to the chat's
 * latest post on either side (the tools default to it). channels may only
 * narrow: to the confirmed list, or when none was confirmed, to the channels
 * the detour just connected.
 */
export function matchesCarriedConfirmation(
  carried: CarriedConfirmation | null,
  name: string,
  args: Record<string, unknown>,
  defaults: { contentId?: string } = {},
): boolean {
  if (!carried || carried.toolName !== name) return false;
  const confirmedArgs = carried.args;
  const keys = new Set([...Object.keys(confirmedArgs), ...Object.keys(args)]);
  for (const key of keys) {
    if (key === 'channels') continue;
    let before = argValue(confirmedArgs[key]);
    let now = argValue(args[key]);
    if (key === 'contentId') {
      before = before ?? defaults.contentId;
      now = now ?? defaults.contentId;
    }
    if (before !== now) return false;
  }
  const confirmedChannels = normalizedChannels(confirmedArgs.channels);
  const channels = normalizedChannels(args.channels);
  if (!channels) return !confirmedChannels;
  const allowed = new Set(confirmedChannels ?? carried.detourChannels);
  return channels.every((c) => allowed.has(c));
}

/** Stable key of the args a confirmation is about (target channel(s), url, content). */
export function approvalArgsKey(args: Record<string, unknown> = {}): string {
  const out: Record<string, string> = {};
  for (const key of Object.keys(args).sort()) {
    if (key === 'channels') {
      const channels = normalizedChannels(args.channels);
      if (channels) out.channels = [...channels].sort().join(',');
      continue;
    }
    const value = argValue(args[key]);
    if (value !== undefined) out[key] = value;
  }
  return JSON.stringify(out);
}

/**
 * True when this call matches a confirmation the session state still holds
 * (the user said yes on that tool's card a few turns ago, even with a
 * pipeline follow-up row or an off-topic turn in between). Uses the same
 * comparison as matchesCarriedConfirmation: same tool, same target.
 */
export function matchesApproval(
  approvals: readonly Approval[] | null | undefined,
  name: string,
  args: Record<string, unknown>,
  defaults: { contentId?: string } = {},
): boolean {
  return (approvals ?? []).some((a) =>
    a.tool === name &&
    matchesCarriedConfirmation(
      { toolName: a.tool, args: a.args ?? {}, detourChannels: a.detourChannels ?? [] },
      name,
      args,
      { contentId: defaults.contentId ?? a.contentId },
    ),
  );
}

const BARE_REPLIES = new Set([
  'do', 'do it', 'ok', 'okay', 'k', 'yes', 'y', 'yeah', 'yep', 'sure', 'go',
  'go ahead', 'alright', 'fine', 'please', 'yes please', 'idk', 'whatever', 'any', 'u choose', 'you choose',
]);
const LIST_ITEM = /^\s*(?:\*\*)?(?:[-*\u2022]|\d+[.)])(?:\*\*)?\s+\S/;

/**
 * True when the user's latest message is a bare "do"/"ok"/"yes" and the
 * previous assistant reply offered several options as a plain list (no
 * ask_user buttons). Acting on it would be a guess, so the chat blocks
 * changes for that turn and the AI asks which option with chips instead.
 */
export function isAmbiguousBareReply(
  history: { role: string; content: string; steps?: unknown }[],
): boolean {
  if (history.length < 2) return false;
  const latest = history[history.length - 1];
  const previous = history[history.length - 2];
  if (latest.role !== 'user' || previous.role !== 'assistant') return false;
  const said = latest.content.trim().toLowerCase().replace(/[.!\s]+$/g, '');
  if (!BARE_REPLIES.has(said)) return false;
  // "yes please" after a list means the recommended (or first) idea - not a guess.
  if (/^(yes|yes please|yeah|yep|sure|please|y)$/.test(said)) return false;
  const options = lastAskUserOptions(previous.steps);
  if (options) {
    // A bare word that is not one of several offered buttons is still a guess.
    return options.length >= 3 && !options.some((o) => o.id === said || o.label === said);
  }
  const items = previous.content.split('\n').filter((line) => LIST_ITEM.test(line));
  return items.length >= 2;
}

export function ambiguousChoiceObservation(reply: string): string {
  return JSON.stringify({
    ok: false,
    code: 'ambiguous_choice',
    message: `The user only said "${reply.trim().slice(0, 20)}" after you listed several options. Nothing was run. Do not guess: call ask_user (type single) with those options as buttons and wait.`,
  });
}

/** Tools a confirmed "set up, then start the post" plan may run together in one turn. */
export const PLAN_CHAIN_TOOLS: ReadonlySet<string> = new Set(['apply_default_workflow', 'add_workflow_node', 'set_workflow_channels', 'start_generation']);
/** ask_user option id the plan-confirm card uses for "Start post". */
export const PLAN_CONFIRM_OPTION_ID = 'start_post';

/** The user just clicked "Start post" on a plan-confirm card: allow the chain this turn. */
export function confirmedPlanChain(
  history: { role: string; content: string; steps?: unknown }[],
): ReadonlySet<string> | null {
  if (!isConfirmedByUser(history)) return null;
  const choice = parseUserChoice(history[history.length - 1].content);
  return choice?.ids.includes(PLAN_CONFIRM_OPTION_ID) ? PLAN_CHAIN_TOOLS : null;
}

const PROFILE_WORDS = /\b(tone|voice|channels?|audience|name|industry|brand|profile|instagram|facebook|tiktok|linkedin|youtube|rednote|xiaohongshu|location|language|hashtags?|change|update|set|switch|add|remove|only|not)\b|[\u0E00-\u0E7F\u4E00-\u9FFF\u1000-\u109F]/i;

/**
 * "Don't ask me", "do it yourself", "all the way to publish": the user waived
 * follow-up questions for this request. Setup guards that only exist to ask
 * first (plan_first, not_requested, confirm_start, the preview card) step aside.
 */
const WAIVE_ASKS =
  /\b(do(n'?t| not) ask( me)?|stop asking|no (more )?questions|without asking|(do|build|make) it (all )?(yourself|urself)|build (by )?(yourself|urself)|do (it|everything) for me|just do it|all the way|handle (it|everything)|figure it out|(you|u) decide|won'?t give( you| u)? (more |any )?info)\b/i;
export function waivesQuestions(userText: string): boolean {
  return WAIVE_ASKS.test(userText);
}

/** The waiver holds for the request it was given on: this message or one of the last few user rows (e.g. "done" after OAuth). */
export function waivedRecently(history: readonly { role: string; content: string }[], window = 6): boolean {
  return history.filter((m) => m.role === 'user').slice(-window).some((m) => waivesQuestions(m.content));
}

/** Confirm-first tools a waiver ("do it yourself all the way to publish") may run without a card. Deletes / cancels still ask. */
export const WAIVABLE_CONFIRMATION_TOOLS: ReadonlySet<string> = new Set(['approve_content', 'publish_now']);

/** update_rule only when the user's message is about the brand profile; never a silent side change. */
export function unrequestedProfileChange(
  userText: string,
  opts: { args?: Record<string, unknown>; waived?: boolean; pendingPostText?: string | null; brandChannels?: readonly string[]; blankBrand?: boolean } = {},
): string | null {
  if (opts.blankBrand) return null;
  if (PROFILE_WORDS.test(userText)) return null;
  // Adding the channel a pending post needs ("...upload on facebook", then "do it yourself")
  // is part of that request, not a side change - when only channels change and the
  // user waived asks or the brand has no channel at all yet.
  const onlyChannels = !!opts.args && Object.keys(opts.args).length > 0 && Object.keys(opts.args).every((k) => k === 'channels');
  if (onlyChannels && (opts.waived || opts.brandChannels?.length === 0) && (opts.waived || CHANNEL_WORDS.test(opts.pendingPostText ?? ''))) return null;
  return JSON.stringify({ ok: false, code: 'not_requested', error: 'The user did not ask to change the brand profile. Not run.', next: 'Do not change the profile. Continue with what the user asked.' });
}

const AFFIRM_REPLY =
  /^(yes|y|yeah|yep|yup|sure|ok|okay|k|go|go ahead|start|start now|start it|start post|do it|let'?s go|let'?s do it|please|yes please|yes start|ok start|confirm|confirmed|\u101f\u102f\u1010\u103a|\u101f\u102f\u1010\u103a\u1000\u1032\u1037|\u1005\u101c\u102d\u102f\u1000\u103a|\u1005\u1019\u101a\u103a|\u0e43\u0e0a\u0e48|\u0e44\u0e14\u0e49|\u0e40\u0e23\u0e34\u0e48\u0e21|\u0e42\u0e2d\u0e40\u0e04|\u597d|\u597d\u7684|\u662f|\u5f00\u59cb)$/u;

/** A plain yes / start: typed, or a non-negative chip (e.g. Yes on the AI's own "Start now?" ask). */
export function isAffirmativeReply(content: string): boolean {
  const norm = (v: string) => v.trim().toLowerCase().replace(/[.!?\s\u104b]+$/u, '');
  const match = USER_CHOICE_PATTERN.exec(content.trim());
  const values = match
    ? [...match[1].split(','), ...match[2].split(',')].map(norm).filter(Boolean)
    : [norm(content)];
  if (!values.length || values.some((v) => NEGATIVE_ANSWERS.has(v))) return false;
  return values.some((v) => v === PLAN_CONFIRM_OPTION_ID || AFFIRM_REPLY.test(v));
}

/**
 * A start_generation plan card (preview_confirm) is still open in the last few
 * assistant turns (no run started since) and the user's latest message is a
 * plain yes / start. That yes confirms the card, so the user never confirms
 * twice. A card that proposes adding missing steps/channels (needsAdding) is
 * not confirmed by a bare yes: that yes means "add them".
 */
export function affirmsPendingStartPreview(
  history: { role: string; content: string; steps?: unknown }[],
): boolean {
  const latest = history[history.length - 1];
  if (latest?.role !== 'user' || !isAffirmativeReply(latest.content)) return false;
  let assistants = 0;
  for (let i = history.length - 2; i >= 0 && assistants < 3; i--) {
    const turn = history[i];
    if (turn.role === 'user' && !isAffirmativeReply(turn.content) && assistants > 0) return false;
    if (turn.role !== 'assistant') continue;
    assistants++;
    const steps = Array.isArray(turn.steps) ? (turn.steps as TurnStep[]) : [];
    for (let j = steps.length - 1; j >= 0; j--) {
      const s = steps[j];
      if (s?.type !== 'observation' || s.name !== 'start_generation' || typeof s.result !== 'string') continue;
      if (/"action"\s*:\s*"pipeline_started"/.test(s.result)) return false;
      if (/"code"\s*:\s*"preview_confirm"/.test(s.result)) return !/"needsAdding"\s*:\s*true/.test(s.result);
    }
  }
  return false;
}

/** Steps this turn so far, as the tool-calling loop records them. */
export type TurnStep = { type?: unknown; name?: unknown; result?: unknown };

function ranOk(steps: readonly TurnStep[], names: ReadonlySet<string>): boolean {
  return steps.some((s) => {
    if (s?.type !== 'observation' || !names.has(String(s.name)) || typeof s.result !== 'string') return false;
    try {
      return (JSON.parse(s.result) as { ok?: unknown })?.ok === true;
    } catch {
      // Plain-text results ("Brand profile updated.") are successes.
      return !/^\s*(\{|Not run|Unknown tool)/.test(s.result);
    }
  });
}

/** save_content in the same turn as rerun_content_node would copy the old result. */
export function saveBeforeRerunFinished(name: string, turnSteps: readonly TurnStep[]): string | null {
  if (name !== 'save_content') return null;
  const reran = turnSteps.some((s) => s?.type === 'observation' && s.name === 'rerun_content_node');
  return reran ? toolError('rerun_pending', 'Not run: the re-run from this turn has not finished, so there is nothing new to save yet.') : null;
}

const WORKFLOW_BUILD_TOOLS: ReadonlySet<string> = new Set(['generate_workflow', 'apply_default_workflow']);

/** Only one of generate_workflow / apply_default_workflow, once per turn. */
export function workflowAlreadyBuilt(name: string, turnSteps: readonly TurnStep[]): string | null {
  if (!WORKFLOW_BUILD_TOOLS.has(name) || !ranOk(turnSteps, WORKFLOW_BUILD_TOOLS)) return null;
  return toolError('workflow_just_built', 'Not run: a workflow was already created this turn.');
}

export const normalizeRequest = (text: string): string =>
  text.toLowerCase().replace(/\[\[asset:[^\]]*\]\]/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/**
 * The user sent the same post request again (same text, no new attachment)
 * and an earlier turn in the last few already started it: ask before a second
 * run. A chip click (e.g. Yes to "Make another one?") is never a repeat.
 */
export function repeatedPostRequest(history: { role: string; content: string; steps?: unknown }[]): string | null {
  const latest = history[history.length - 1];
  if (latest?.role !== 'user' || /\[\[asset:/.test(latest.content) || /^\s*user choice:/i.test(latest.content)) return null;
  if (isConfirmedByUser(history)) return null;
  const said = normalizeRequest(latest.content);
  if (said.split(' ').length < 3) return null;
  for (let i = history.length - 2; i >= 1 && i >= history.length - 7; i--) {
    const turn = history[i];
    if (turn.role !== 'assistant' || !Array.isArray(turn.steps)) continue;
    const started = (turn.steps as TurnStep[]).some(
      (s) => s?.type === 'observation' && s.name === 'start_generation' && typeof s.result === 'string' && /"action"\s*:\s*"pipeline_started"/.test(s.result),
    );
    const asked = history[i - 1];
    if (started && asked?.role === 'user' && normalizeRequest(asked.content) === said) {
      return toolError('already_started', 'Not run: this exact post was already started earlier in this chat.');
    }
  }
  return null;
}

/**
 * Same as repeatedPostRequest, but against the post requests the session
 * state remembers (beyond the 7-row window): `startedRequests` are the
 * normalized requests of earlier pipeline_started results.
 */
export function repeatedPostRequestInState(latestText: string, startedRequests: readonly string[]): string | null {
  if (!startedRequests.length || /\[\[asset:/.test(latestText) || /^\s*user choice:/i.test(latestText)) return null;
  const said = normalizeRequest(latestText);
  if (said.split(' ').length < 3 || !startedRequests.includes(said)) return null;
  return toolError('already_started', 'Not run: this exact post was already started earlier in this chat.');
}

const CHANNEL_WORDS = /\b(instagram|insta|ig|facebook|fb|linkedin|tiktok|youtube|yt|rednote|xiaohongshu)\b/i;
/** Words that say the saved workflow / brand channels should change, not just this post. */
const TEMPLATE_WORDS =
  /\b(workflows?|templates?|canvas|lanes?|from now on|future|going forward|always|only|every|all (my |our |the )?posts|brand|profile|my channels|our channels|switch|instead|stop posting|no longer|drop|remove|replace|anymore)\b/i;

/**
 * "Add TikTok" / "post this on Instagram too" with a Latest post means this
 * draft (generate_more_adapt), not the saved workflow. Blocks
 * set_workflow_channels only when all of these hold: there is a Latest post,
 * generate_more_adapt is bound, the message names a channel in English with
 * no template/brand words, it is not a chip answer, and update_rule did not
 * already change the brand channels this turn.
 */
export function draftChannelNotTemplate(input: {
  name: string;
  userText: string;
  hasLatestPost: boolean;
  adaptBound: boolean;
  confirmed: boolean;
  turnSteps: readonly TurnStep[];
}): string | null {
  if (input.name !== 'set_workflow_channels' || !input.hasLatestPost || !input.adaptBound || input.confirmed) return null;
  const text = input.userText;
  if (/[^\x00-\x7F]/.test(text) || /^\s*user choice:/i.test(text)) return null;
  if (!CHANNEL_WORDS.test(text) || TEMPLATE_WORDS.test(text)) return null;
  if (ranOk(input.turnSteps, new Set(['update_rule']))) return null;
  return toolError('use_generate_more_adapt', 'Not run: the user wants the latest post on another channel, which does not change the saved workflow.');
}

/** Brand-channel or workflow-step changes a post request must not make before its plan card. */
const SETUP_CHANGE_TOOLS: ReadonlySet<string> = new Set(['update_rule', 'set_workflow_channels', 'add_workflow_node', 'remove_workflow_node']);
const POST_REQUEST = /\b(post|posts|announce\w*|announcement|campaign|launch|make|create|generate)\b/i;

/**
 * "Website announcement for Facebook, TikTok, 3 images each" (a post request
 * naming channels/images): run start_generation first - its preflight card is
 * the confirmation - instead of changing channels or steps to fit it.
 * "Post only on facebook" / "from now on" (TEMPLATE_WORDS) is a channel change, not a post.
 */
export function planBeforeSetupChange(input: {
  name: string;
  args: Record<string, unknown>;
  userText: string;
  confirmed: boolean;
  /** The brand's saved channels. With none, start_generation cannot run (no_channels), so a plan card is impossible: add the named channel first. */
  brandChannels?: readonly string[];
  waived?: boolean;
}): string | null {
  if (!SETUP_CHANGE_TOOLS.has(input.name) || input.confirmed || input.waived) return null;
  if (input.brandChannels && input.brandChannels.length === 0 && input.name !== 'remove_workflow_node') return null;
  if (input.name === 'update_rule' && input.args.channels === undefined) return null;
  const text = input.userText;
  if (/^\s*user choice:/i.test(text) || !POST_REQUEST.test(text) || TEMPLATE_WORDS.test(text) || /\b(steps?|nodes?)\b/i.test(text)) return null;
  const r = parseRequest(text);
  if (!r.channels.length && !r.wantsImages) return null;
  return toolError('plan_first', 'Not run: this is a post request; check it with start_generation before changing channels or steps.');
}

/**
 * Free-text asks to make/create a post, content, campaign, or video.
 * Used for pendingPostIntent history scan and session Goal seeding.
 */
export const POST_INTENT =
  /\b(make|create|want|need|do|write|generate|produce)\b.{0,60}\b(posts?|content|campaign|videos?)\b|\b(announce|launch)\b|\bpost (about|for|on)\b|\b(campaign|video) (about|for|on|of)\b/i;

export function matchesPostIntent(text: string): boolean {
  return POST_INTENT.test(text);
}

/**
 * An earlier user post request ("I want to make a post about One Piece") that
 * no run has started since, within the last `window` rows. Returns its text.
 */
export function pendingPostIntent(history: { role: string; content: string; steps?: unknown }[], window = 14): string | null {
  for (let i = history.length - 2; i >= 0 && i >= history.length - window; i--) {
    const row = history[i];
    if (row.role === 'assistant' && Array.isArray(row.steps)) {
      const started = (row.steps as TurnStep[]).some((st) => st?.type === 'observation' && st.name === 'start_generation' && typeof st.result === 'string' && /"action"\s*:\s*"pipeline_started"/.test(st.result));
      if (started) return null;
    }
    if (row.role === 'user' && !/^\s*user choice:/i.test(row.content) && matchesPostIntent(row.content)) return row.content;
  }
  return null;
}

/**
 * A profile or workflow change this turn is not a yes to a post: ask before starting one.
 * Exception (first post, Option B): no workflow at turn start, an earlier post request
 * is still pending, and this message just answers setup ("facebook"), not "post only on X".
 */
export function startAfterSetupChange(
  name: string,
  turnSteps: readonly TurnStep[],
  confirmed: boolean,
  firstPost?: { hadWorkflow: boolean; postIntent: boolean; userText: string },
): string | null {
  if (name !== 'start_generation' || confirmed || !ranOk(turnSteps, SETUP_CHANGE_TOOLS)) return null;
  if (firstPost && !firstPost.hadWorkflow && firstPost.postIntent && !TEMPLATE_WORDS.test(firstPost.userText)) return null;
  return toolError('confirm_start', 'Not started: the user changed their setup this turn but did not ask for a post.');
}

