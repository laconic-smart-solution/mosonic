/**
 * Structured per-session chat state: pure, deterministic reducers. Code
 * writes it, never the model. Live state always wins (reconcile), the stage
 * is recomputed on every read, and invalid or old-version state is thrown
 * away and rebuilt from the history window (bootstrap).
 */
import {
  CONNECT_DETOUR_TOOLS,
  MAX_CONNECT_DETOUR_TURNS,
  MUTATING_TOOL_NAMES,
  PLAN_CHAIN_TOOLS,
  PLAN_CONFIRM_OPTION_ID,
  approvalArgsKey,
  isNegativeReply,
  matchesPostIntent,
  normalizeRequest,
  parseUserChoice,
  NEGATIVE_ANSWERS,
} from '../tools/tool-guards.util';
import { ASK_USER_TOOL_NAME } from '../tools/ask-user.tool';
import { connectedChannels, latestPostPublished, type LiveFacts } from './live-facts.util';
import {
  SESSION_STATE_VERSION,
  type Approval,
  type ChatGoal,
  type ChatSessionState,
  type ChatStage,
  type PendingAsk,
  type PendingChain,
  type PendingConnect,
  type PendingItem,
  type PendingRun,
} from './session-state.types';

export const MAX_PENDING = 4;
export const MAX_APPROVALS = 3;
export const MAX_CHOICES = 8;
export const MAX_RECENT = 6;
export const RECENT_MAX_CHARS = 120;
export const CONNECT_TTL_TURNS = 3;
export const CHAIN_TTL_TURNS = 2;
export const GOAL_TTL_TURNS = 10;
/** Matches RUN_WATCH_TTL_SEC in chat-pipeline-followup.service.ts (6 h). */
export const RUN_TTL_MS = 6 * 60 * 60 * 1000;
/** Rendered "Session state" block budget. */
export const SESSION_STATE_MAX_CHARS = 600;
/** Synthetic tool name of a pipeline follow-up row's first step. */
export const FOLLOWUP_TOOL_NAME = 'pipeline_result';

const STAGES: ReadonlySet<string> = new Set<ChatStage>([
  'no_brand', 'brand_no_workflow', 'workflow_no_post', 'run_active', 'post_ready', 'post_published',
]);
const GOAL_KINDS: ReadonlySet<string> = new Set(['make_post', 'publish', 'setup_brand', 'edit_workflow']);

/**
 * How each observation `action` the tools emit is reduced. The exhaustiveness
 * spec fails when a tool emits an action that is not listed here.
 */
export const OBSERVATION_ACTIONS: Readonly<Record<string, 'ask' | 'connect' | 'run' | 'cancel' | 'recent' | 'read'>> = {
  ask_user: 'ask',
  start_oauth: 'connect',
  start_rednote_qr: 'connect',
  pipeline_started: 'run',
  pipeline_cancelled: 'cancel',
  show_workflow: 'recent',
  content_approved: 'recent',
  content_rejected: 'recent',
  content_rerun_started: 'recent',
  generate_more_started: 'recent',
  image_generated: 'recent',
  publish_started: 'recent',
  scheduled: 'recent',
  post_retry_started: 'recent',
  upload_retry_started: 'recent',
  content_edited: 'recent',
  upload_media_added: 'recent',
  upload_media_removed: 'recent',
  upload_channel_updated: 'recent',
  rescheduled: 'recent',
  schedule_cancelled: 'recent',
  upload_preview: 'read',
  rule_suggestion_applied: 'recent',
  pipeline_result: 'read',
  pipeline_status: 'read',
  check_channel_auth: 'read',
  list_channels: 'read',
  list_contents: 'read',
  list_posts: 'read',
  post_analytics: 'read',
  request_upload: 'read',
  rule_suggestions: 'read',
  show_post: 'read',
  show_upload: 'read',
};

/** Plain-language line per tool for the "Done" list. */
const TOOL_DONE_TEXT: Readonly<Record<string, string>> = {
  create_rule_from_intake: 'brand profile created',
  update_rule: 'brand profile updated',
  remember: 'memory note saved',
  forget: 'memory note removed',
  forget_all: 'all memory notes removed',
  apply_default_workflow: 'default workflow set up',
  generate_workflow: 'workflow built',
  add_workflow_node: 'workflow step added',
  remove_workflow_node: 'workflow step removed',
  reorder_workflow_nodes: 'workflow steps reordered',
  set_workflow_channels: 'workflow channels changed',
  update_node_config: 'workflow step settings changed',
  set_video_node_look: 'video step look changed',
  start_generation: 'post started',
  save_content: 'draft saved',
  approve_content: 'draft approved',
  reject_content: 'draft rejected',
  rerun_content_node: 'draft step re-run started',
  generate_more_image: 'extra image started',
  generate_more_translation: 'translation started',
  generate_more_summary: 'summary started',
  generate_more_adapt: 'channel version started',
  generate_presenter_video: 'presenter video started',
  generate_cinematic_video: 'cinematic video started',
  cancel_pipeline: 'run cancelled',
  publish_now: 'publish started',
  schedule_publish: 'publish scheduled',
  retry_publish: 'publish retried',
  edit_content: 'draft text edited',
  add_upload_media: 'media added to the post',
  remove_upload_media: 'media removed from the post',
  edit_upload_channel: 'channel settings on the post changed',
  reschedule_publish: 'scheduled post moved',
  cancel_schedule: 'scheduled post cancelled',
  apply_rule_suggestion: 'brand improvement applied',
  fetch_website_assets: 'site images saved',
};

/** Ask questions that map to a remembered choice key. */
function choiceKeyFor(ask: PendingAsk): string | null {
  if (ask.confirmFor === 'fetch_website_assets') return 'website';
  if (ask.optionIds.includes(PLAN_CONFIRM_OPTION_ID)) return 'plan';
  if (ask.optionIds.includes('remove') && ask.optionIds.includes('keep')) return 'image_step';
  if (/\bindustry\b|looks like .* is (a|an)\b/i.test(ask.question)) return 'industry';
  if (/\bimages?\b|\bphotos?\b/i.test(ask.question)) return 'images';
  if (ask.confirmFor) return ask.confirmFor;
  return null;
}

/** Goal-setting chips (greeting card, plan card). */
const GOAL_CHIPS: Readonly<Record<string, ChatGoal['kind']>> = {
  make_post: 'make_post',
  post: 'make_post',
  [PLAN_CONFIRM_OPTION_ID]: 'make_post',
  setup_brand: 'setup_brand',
  setup: 'setup_brand',
};

export function emptyState(): ChatSessionState {
  return { v: SESSION_STATE_VERSION, turn: 0, stage: 'no_brand', pending: [], approvals: [], choices: [], recent: [] };
}

function clone(state: ChatSessionState): ChatSessionState {
  return JSON.parse(JSON.stringify(state)) as ChatSessionState;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const strArr = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);

function validPending(p: unknown): p is PendingItem {
  if (!isObj(p) || !isNum(p.turn)) return false;
  switch (p.kind) {
    case 'ask':
      return isStr(p.question) && strArr(p.optionIds) && (p.optionLabels === undefined || strArr(p.optionLabels)) && (p.confirmFor === undefined || isStr(p.confirmFor)) && (p.args === undefined || isObj(p.args));
    case 'connect':
      return isStr(p.channel) && (p.via === 'oauth' || p.via === 'qr');
    case 'run':
      return isStr(p.pipelineId) && typeof p.announced === 'boolean';
    case 'chain':
      return strArr(p.tools);
    default:
      return false;
  }
}

function validApproval(a: unknown): a is Approval {
  return isObj(a) && isStr(a.tool) && isStr(a.argsKey) && isNum(a.confirmedTurn) && isNum(a.expiresTurn) && (a.args === undefined || isObj(a.args));
}

/** Parse a stored snapshot. Anything malformed or from another version returns null (then bootstrap). */
export function parseState(raw: unknown): ChatSessionState | null {
  if (!isObj(raw) || raw.v !== SESSION_STATE_VERSION || !isNum(raw.turn)) return null;
  if (!Array.isArray(raw.pending) || !Array.isArray(raw.approvals) || !Array.isArray(raw.choices) || !Array.isArray(raw.recent)) return null;
  if (!raw.pending.every(validPending) || !raw.approvals.every(validApproval)) return null;
  if (!raw.choices.every((c) => isObj(c) && isStr(c.key) && isStr(c.value) && isNum(c.turn))) return null;
  if (!raw.recent.every((r) => isObj(r) && isStr(r.text) && isNum(r.turn))) return null;
  const goal = raw.goal;
  if (goal !== undefined && !(isObj(goal) && isStr(goal.kind) && GOAL_KINDS.has(goal.kind) && isNum(goal.turn))) return null;
  const state = clone(raw as unknown as ChatSessionState);
  if (!STAGES.has(state.stage)) state.stage = 'no_brand';
  return state;
}

type StepLike = { type?: unknown; name?: unknown; args?: unknown; toolCallId?: unknown; result?: unknown };
type RowLike = { role: string; content: string; steps?: unknown; state?: unknown };

function stepList(steps: unknown): StepLike[] {
  return Array.isArray(steps) ? (steps as StepLike[]).filter((s) => !!s && typeof s === 'object') : [];
}

/** An automatic report row written after a chat-started run ended. */
export function isFollowUpRow(row: { role: string; steps?: unknown }): boolean {
  return row.role === 'assistant' && stepList(row.steps)[0]?.name === FOLLOWUP_TOOL_NAME;
}

function parseJson(text: unknown): Record<string, unknown> | null {
  if (!isStr(text)) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return isObj(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function clip(text: string, max = RECENT_MAX_CHARS): string {
  const one = text.replace(/\s+/g, ' ').trim();
  return one.length <= max ? one : `${one.slice(0, max - 1).trimEnd()}…`;
}

function enforceCaps(s: ChatSessionState): ChatSessionState {
  // Newest last; keep the newest.
  if (s.pending.length > MAX_PENDING) s.pending = s.pending.slice(-MAX_PENDING);
  if (s.approvals.length > MAX_APPROVALS) s.approvals = s.approvals.slice(-MAX_APPROVALS);
  if (s.choices.length > MAX_CHOICES) s.choices = s.choices.slice(-MAX_CHOICES);
  if (s.recent.length > MAX_RECENT) s.recent = s.recent.slice(-MAX_RECENT);
  return s;
}

function addRecent(s: ChatSessionState, text: string, key?: string): void {
  s.recent.push({ turn: s.turn, text: clip(text), ...(key ? { key } : {}) });
}

function setChoice(s: ChatSessionState, key: string, value: string): void {
  s.choices = s.choices.filter((c) => c.key !== key);
  s.choices.push({ key, value: clip(value, 60), turn: s.turn });
}

export type UserMessageResolution = {
  /** The pending ask this message answered (or failed to match), if any. */
  ask: PendingAsk | null;
  /** The message picked options of that ask (all ids/labels found on the card). */
  matched: boolean;
  /** ...and none of them is a no/cancel/skip (same rule as isConfirmedByUser). */
  positive: boolean;
  negative: boolean;
  /** A start_post chip confirmed the plan chain this turn. */
  chain: ReadonlySet<string> | null;
  /** A bare yes to a card of choices (content ideas): its first option. Not a confirmation. */
  firstOption?: string;
};

// Same words isAmbiguousBareReply treats as "the first idea" (bare ok/do stays ambiguous).
const BARE_YES = /^\s*(yes|yes please|yeah|yep|sure|please|y)[.!\s]*$/i;
/** Typed "go on" for a not_run chain (a matched positive chip counts too). */
const CONTINUE_REPLY = /^\s*(yes|yes please|yeah|yep|sure|ok|okay|please|y|go|go ahead|go on|continue|keep going|carry on|do it|do the rest|finish( it)?|allow( once)?|allow_once|continue_chain)[.!\s]*$/i;
const YES_NO_IDS = /^(yes|y|ok|no|not_now|not now|start_post|change|keep|remove|cancel)$/i;

/**
 * Runs before the loop: bump the turn, expire old items, and resolve the
 * pending ask with the user's message (chip or typed id/label, matched
 * against the stored options only, so an old tab's chip does not count).
 */
export function reduceUserMessage(
  prev: ChatSessionState,
  text: string,
): { state: ChatSessionState; resolution: UserMessageResolution } {
  const s = clone(prev);
  s.turn += 1;
  s.approvals = s.approvals.filter((a) => a.expiresTurn >= s.turn);
  s.pending = s.pending.filter((p) => {
    if (p.kind === 'connect') return p.turn + CONNECT_TTL_TURNS >= s.turn;
    if (p.kind === 'chain') return p.turn + CHAIN_TTL_TURNS >= s.turn;
    return true;
  });
  if (s.goal && s.goal.turn + GOAL_TTL_TURNS < s.turn) delete s.goal;

  const negative = isNegativeReply(text);
  const resolution: UserMessageResolution = { ask: null, matched: false, positive: false, negative, chain: null };
  const ask = s.pending.find((p): p is PendingAsk => p.kind === 'ask') ?? null;
  const notRunChain = s.pending.find((p): p is PendingChain => p.kind === 'chain' && p.source === 'not_run') ?? null;
  // Any next user message clears the ask (chip or free text).
  s.pending = s.pending.filter((p) => p.kind !== 'ask');
  if (ask) {
    resolution.ask = ask;
    const ids = ask.optionIds.map((o) => o.trim().toLowerCase());
    const labels = (ask.optionLabels ?? []).map((o) => o.trim().toLowerCase());
    const choice = parseUserChoice(text);
    const picked = (choice?.ids ?? []).map((id, i) => {
      let at = ids.indexOf(id);
      if (at < 0) at = labels.indexOf(id);
      if (at < 0 && choice) at = labels.indexOf(choice.labels[i]);
      return at;
    });
    if (picked.length > 0 && picked.every((at) => at >= 0)) {
      const pickedIds = picked.map((at) => ids[at]);
      const pickedLabels = picked.map((at) => labels[at] ?? ids[at]);
      resolution.matched = true;
      const isNo = pickedIds.some((id, i) => NEGATIVE_ANSWERS.has(id) || NEGATIVE_ANSWERS.has(pickedLabels[i]));
      resolution.positive = !isNo;
      const key = choiceKeyFor(ask);
      if (key) {
        const url = isStr(ask.args?.url) ? ask.args.url.trim() : '';
        setChoice(s, key, `${url ? `${url} = ` : ''}${pickedIds.join(',')}`);
      }
      if (!isNo && ask.confirmFor) {
        const args = ask.args ?? {};
        s.approvals = s.approvals.filter((a) => a.tool !== ask.confirmFor);
        s.approvals.push({
          tool: ask.confirmFor,
          argsKey: approvalArgsKey(args),
          args,
          ...(isStr(args.contentId) && args.contentId.trim() ? { contentId: args.contentId.trim() } : {}),
          confirmedTurn: s.turn,
          expiresTurn: s.turn + MAX_CONNECT_DETOUR_TURNS,
        });
      }
      if (!isNo && pickedIds.includes(PLAN_CONFIRM_OPTION_ID)) {
        const chain: PendingChain = { kind: 'chain', turn: s.turn, tools: [...PLAN_CHAIN_TOOLS] };
        s.pending = s.pending.filter((p) => p.kind !== 'chain');
        s.pending.push(chain);
        resolution.chain = PLAN_CHAIN_TOOLS;
      }
      if (!isNo) {
        const goalKind = pickedIds.map((id) => GOAL_CHIPS[id]).find(Boolean);
        if (goalKind) s.goal = { kind: goalKind, turn: s.turn, ...(s.goal?.kind === goalKind && s.goal.detail ? { detail: s.goal.detail } : {}) };
      }
    }
    // "yes please" after idea buttons = the first (recommended) idea; never ask which.
    else if (!ask.confirmFor && ids.length >= 2 && BARE_YES.test(text) && !ids.some((id) => YES_NO_IDS.test(id) || NEGATIVE_ANSWERS.has(id))) {
      resolution.matched = true;
      resolution.firstOption = labels[0] || ids[0];
    }
  }
  if (negative) {
    s.approvals = [];
    s.pending = s.pending.filter((p) => p.kind !== 'connect' && p.kind !== 'chain');
  } else if (notRunChain) {
    // Yes / continue / allow-once continues the leftover chain; any other message is a new topic.
    const goOn = (resolution.matched && resolution.positive && !resolution.firstOption) || CONTINUE_REPLY.test(text);
    if (goOn && !resolution.chain) {
      resolution.chain = new Set(notRunChain.tools);
    } else if (!goOn) {
      s.pending = s.pending.filter((p) => p !== notRunChain);
    }
  }

  // Free-text content task -> Goal.make_post (chips already handled above).
  // Short ask answers / continue replies / bare choice chips must not replace an
  // existing goal unless the user literally picked a GOAL_CHIPS id.
  const choiceOnly = /^\s*user choice:/i.test(text);
  const bareContinue = CONTINUE_REPLY.test(text.trim()) || BARE_YES.test(text.trim());
  if (!choiceOnly && !bareContinue && matchesPostIntent(text)) {
    if (!s.goal) {
      s.goal = { kind: 'make_post', turn: s.turn, detail: clip(text) };
    } else if (s.goal.kind === 'make_post') {
      s.goal = { kind: 'make_post', turn: s.turn, detail: clip(text) };
    }
  }

  return { state: enforceCaps(s), resolution };
}

function stepOk(name: string, result: unknown, payload: Record<string, unknown> | null): boolean {
  if (payload) return payload.ok !== false;
  if (!isStr(result)) return false;
  // Plain-text results are successes unless they say otherwise.
  return !/^\s*(Not run|Unknown tool|No brand profile|Could not|No usable|Found images on .* none|Error)/i.test(result) && name.length > 0;
}

function describeDone(name: string, payload: Record<string, unknown> | null, result: string, args: Record<string, unknown>): string {
  if (name === 'fetch_website_assets') {
    const m = /^Saved (\d+) asset\(s\) from (\S+?):/.exec(result);
    if (m) return `${m[1]} site images saved from ${m[2]}`;
  }
  const base = TOOL_DONE_TEXT[name] ?? (isStr(payload?.action) ? String(payload.action).replace(/_/g, ' ') : `${name} done`);
  const channels = Array.isArray(args.channels) ? args.channels.filter(isStr) : Array.isArray(payload?.channels) ? (payload.channels as unknown[]).filter(isStr) : [];
  const channel = isStr(args.channel) ? args.channel : isStr(payload?.platform) ? payload.platform : '';
  const target = channels.length ? ` (${channels.join(', ')})` : channel ? ` (${channel})` : '';
  return `${base}${target}`;
}

export type ObservationInput = { name: string; args?: Record<string, unknown>; result: string };

/**
 * Applies one tool observation of a user turn. Asks become pending.ask,
 * connect starts pending.connect, a started run pending.run; changes go to
 * the "Done" list. A tool that ran ok consumes its approval; any other
 * mutating tool (not the connect detour) clears approvals.
 */
export function reduceObservation(
  prev: ChatSessionState,
  obs: ObservationInput,
  ctx: { userText?: string; now?: number } = {},
): ChatSessionState {
  const s = clone(prev);
  const payload = parseJson(obs.result);
  const args = obs.args ?? {};
  const action = isStr(payload?.action) ? payload.action : null;

  if (action === 'ask_user') {
    const options = Array.isArray(payload?.options) ? (payload.options as unknown[]).filter(isObj) : [];
    const confirmFor = isStr(payload?.confirmFor) ? payload.confirmFor : undefined;
    if (obs.name !== ASK_USER_TOOL_NAME && !confirmFor) return s;
    const cardArgs = confirmFor === 'fetch_website_assets' && isStr(payload?.url) && payload.url ? { ...args, url: payload.url } : args;
    const ask: PendingAsk = {
      kind: 'ask',
      turn: s.turn,
      question: clip(isStr(payload?.question) ? payload.question : '', 160),
      optionIds: options.map((o) => (isStr(o.id) ? o.id : '').trim().toLowerCase()),
      optionLabels: options.map((o) => (isStr(o.label) ? o.label : '').trim().toLowerCase()),
      ...(confirmFor ? { confirmFor, args: cardArgs } : {}),
    };
    s.pending = s.pending.filter((p) => p.kind !== 'ask');
    s.pending.push(ask);
    if (confirmFor === 'publish_now' || confirmFor === 'schedule_publish' || confirmFor === 'reschedule_publish') {
      const ch = Array.isArray(args.channels) ? args.channels.filter(isStr).join(', ') : '';
      s.goal = { kind: 'publish', turn: s.turn, ...(ch ? { detail: ch } : {}) };
    }
    return enforceCaps(s);
  }

  const ok = stepOk(obs.name, obs.result, payload);
  const tracked = MUTATING_TOOL_NAMES.has(obs.name) || obs.name === 'fetch_website_assets' || (action !== null && OBSERVATION_ACTIONS[action] !== 'read' && OBSERVATION_ACTIONS[action] !== undefined);
  if (!ok) {
    const code = isStr(payload?.code) ? payload.code : 'error';
    if (tracked && code !== 'followup_read_only' && code !== 'confirmation_required') {
      addRecent(s, `${obs.name} failed: ${code}`);
    }
    return enforceCaps(s);
  }

  // Approvals: consumed by their own tool; cleared by any other change.
  if (s.approvals.some((a) => a.tool === obs.name)) {
    s.approvals = s.approvals.filter((a) => a.tool !== obs.name);
  } else if (MUTATING_TOOL_NAMES.has(obs.name) && !CONNECT_DETOUR_TOOLS.has(obs.name)) {
    s.approvals = [];
  }

  if (action === 'start_oauth' || action === 'start_rednote_qr') {
    const channel = (isStr(payload?.platform) ? payload.platform : isStr(args.channel) ? args.channel : '').trim().toLowerCase();
    if (channel) {
      s.pending = s.pending.filter((p) => !(p.kind === 'connect' && p.channel === channel));
      s.pending.push({ kind: 'connect', turn: s.turn, channel, via: action === 'start_rednote_qr' ? 'qr' : 'oauth' } satisfies PendingConnect);
      // A confirmed action waiting on this connect may narrow to it.
      for (const a of s.approvals) a.detourChannels = [...new Set([...(a.detourChannels ?? []), channel])];
      addRecent(s, `${channel} connect started`);
    }
    return enforceCaps(s);
  }

  if (action === 'pipeline_started') {
    const pipelineId = isStr(payload?.pipelineId) ? payload.pipelineId : '';
    const request = ctx.userText && !/^\s*user choice:/i.test(ctx.userText) ? normalizeRequest(ctx.userText) : '';
    if (pipelineId) {
      s.pending = s.pending.filter((p) => !(p.kind === 'run' && p.pipelineId === pipelineId));
      s.pending.push({ kind: 'run', turn: s.turn, pipelineId, announced: false, ...(ctx.now !== undefined ? { at: ctx.now } : {}), ...(request ? { request } : {}) } satisfies PendingRun);
    }
    s.pending = s.pending.filter((p) => !(p.kind === 'chain' && p.tools.at(-1) === obs.name));
    if (s.goal?.kind === 'make_post') delete s.goal;
    addRecent(s, describeDone(obs.name, payload, obs.result, args), request || undefined);
    return enforceCaps(s);
  }

  if (action === 'pipeline_cancelled') {
    const id = isStr(payload?.pipelineId) ? payload.pipelineId : isStr(args.pipelineId) ? args.pipelineId : '';
    s.pending = s.pending.filter((p) => !(p.kind === 'run' && (!id || p.pipelineId === id)));
    addRecent(s, 'run cancelled');
    return enforceCaps(s);
  }

  if (action === 'publish_started' || action === 'scheduled') {
    if (s.goal?.kind === 'publish') delete s.goal;
  }
  // A chain is done once its last tool ran.
  s.pending = s.pending.filter((p) => !(p.kind === 'chain' && p.tools.at(-1) === obs.name));
  if (tracked) addRecent(s, describeDone(obs.name, payload, obs.result, args));
  return enforceCaps(s);
}

/** The loop's view of a turn: which planned/deferred changes never ran and why it stopped. */
export type TurnOutcomeLike = { ran: string[]; failed: string[]; notRun: string[]; stopReason: string };

/**
 * After reduceTurnSteps: keep the changes this request still needs as a
 * not_run chain (failed tools are never carried; a stall carries nothing),
 * or drop the old one when nothing is left.
 */
export function reduceLoopOutcome(prev: ChatSessionState, outcome: TurnOutcomeLike | null | undefined): ChatSessionState {
  if (!outcome) return prev;
  const s = clone(prev);
  s.pending = s.pending.filter((p) => !(p.kind === 'chain' && p.source === 'not_run'));
  const tools = outcome.stopReason === 'stall'
    ? []
    : [...new Set(outcome.notRun)].filter((t) => !outcome.failed.includes(t) && !outcome.ran.includes(t));
  if (tools.length > 0) s.pending.push({ kind: 'chain', turn: s.turn, tools, source: 'not_run' } satisfies PendingChain);
  return enforceCaps(s);
}

/** All observations of one user turn, paired with their action's args. */
export function reduceTurnSteps(
  prev: ChatSessionState,
  steps: unknown,
  ctx: { userText?: string; now?: number } = {},
): ChatSessionState {
  const rows = stepList(steps);
  const argsById = new Map<string, Record<string, unknown>>();
  for (const st of rows) {
    if (st.type === 'action' && isStr(st.toolCallId) && isObj(st.args)) argsById.set(st.toolCallId, st.args);
  }
  let s = prev;
  for (const st of rows) {
    if (st.type !== 'observation' || !isStr(st.name) || !isStr(st.result)) continue;
    s = reduceObservation(s, { name: st.name, args: isStr(st.toolCallId) ? argsById.get(st.toolCallId) : undefined, result: st.result }, ctx);
  }
  return s;
}

/**
 * A pipeline follow-up row: mark the run announced and note the result.
 * Never touches pending.ask or approvals, so a card the user has not
 * answered yet still counts when they tap Yes after the report.
 */
export function reduceFollowUp(prev: ChatSessionState, steps: unknown): ChatSessionState {
  const s = clone(prev);
  const rows = stepList(steps);
  const idByCall = new Map<string, string>();
  for (const st of rows) {
    if (st.type === 'action' && isStr(st.toolCallId) && isObj(st.args) && isStr(st.args.pipelineId)) idByCall.set(st.toolCallId, st.args.pipelineId);
  }
  for (const st of rows) {
    if (st.type !== 'observation' || st.name !== FOLLOWUP_TOOL_NAME) continue;
    const payload = parseJson(st.result);
    const id = (isStr(st.toolCallId) ? idByCall.get(st.toolCallId) : undefined) ?? (isStr(payload?.pipelineId) ? payload.pipelineId : '');
    let found = false;
    for (const p of s.pending) {
      if (p.kind === 'run' && (!id || p.pipelineId === id)) {
        p.announced = true;
        found = true;
      }
    }
    if (!found && id) s.pending.push({ kind: 'run', turn: s.turn, pipelineId: id, announced: true });
    const status = isStr(payload?.status) ? payload.status : 'finished';
    addRecent(s, `run ${status}${payload?.hasImage === true ? ', draft has an image' : ''}`);
  }
  return enforceCaps(s);
}

export function deriveStage(facts: LiveFacts | null | undefined): ChatStage {
  if (!facts) return 'no_brand';
  if (!facts.workflow) return 'brand_no_workflow';
  if (facts.activeRun) return 'run_active';
  if (facts.latestPost) return latestPostPublished(facts) ? 'post_published' : 'post_ready';
  return 'workflow_no_post';
}

/**
 * Live state wins: drop connects that are now connected, runs that have
 * finished and been announced (or are older than the run watch TTL), and
 * approvals bound to a post that is no longer the latest; recompute stage.
 * `facts` null = onboarding (no brand yet).
 */
export function reconcile(prev: ChatSessionState, facts: LiveFacts | null, now = Date.now()): ChatSessionState {
  const s = clone(prev);
  s.stage = deriveStage(facts);
  if (!facts) return enforceCaps(s);
  const connected = connectedChannels(facts);
  s.pending = s.pending.filter((p) => {
    if (p.kind === 'connect') return !connected.has(p.channel);
    if (p.kind === 'run') {
      if (p.at !== undefined && now - p.at > RUN_TTL_MS) return false;
      const live = facts.activeRun?.pipelineId === p.pipelineId;
      if (p.announced && !live) return false;
      // Eval dry-run ids never exist as runs: keep them for the turn that started them only.
      if (p.pipelineId.startsWith('dryrun-') && p.turn < s.turn) return false;
    }
    return true;
  });
  const latest = facts.latestPost?.contentId;
  s.approvals = s.approvals
    .map((a) => (!a.contentId && latest && a.confirmedTurn === s.turn ? { ...a, contentId: latest } : a))
    // Only a different latest post retires an approval; an unreadable or
    // missing post leaves it to the tool itself to fail.
    .filter((a) => !a.contentId || !latest || a.contentId === latest);
  return enforceCaps(s);
}

/**
 * Current state before this turn's user message: the newest assistant row's
 * snapshot, plus any rows after it (a failed turn leaves a user row with no
 * assistant row), else a bootstrap over the whole window.
 */
export function readState(rows: readonly RowLike[]): { state: ChatSessionState; source: 'stored' | 'bootstrap' } {
  let start = -1;
  let state = emptyState();
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].role !== 'assistant') continue;
    const parsed = parseState(rows[i].state);
    if (parsed) {
      state = parsed;
      start = i;
      break;
    }
  }
  const source = start >= 0 ? 'stored' : 'bootstrap';
  let lastUser = '';
  for (let j = start + 1; j < rows.length; j++) {
    const row = rows[j];
    if (row.role === 'user') {
      lastUser = row.content;
      state = reduceUserMessage(state, row.content).state;
    } else if (row.role === 'assistant') {
      state = isFollowUpRow(row) ? reduceFollowUp(state, row.steps) : reduceTurnSteps(state, row.steps, { userText: lastUser });
    }
  }
  return { state, source };
}

/** Rebuild state from the history window with the same reducers (no stored snapshot). */
export function bootstrapState(rows: readonly RowLike[]): ChatSessionState {
  return readState(rows.map((r) => ({ role: r.role, content: r.content, steps: r.steps }))).state;
}

/** What the state adds to this turn's tool keep-set (pendingFlowTools). */
export type StatePending = {
  connect: boolean;
  askConfirmFor?: string;
  chainTools: string[];
  approvalTools: string[];
  /** Unfinished make_post Goal: keep generation tools even on short ask answers. */
  goalTools: string[];
};

export function statePendingFor(state: ChatSessionState, resolution?: UserMessageResolution | null): StatePending {
  return {
    connect: state.pending.some((p) => p.kind === 'connect'),
    ...(resolution?.ask?.confirmFor ? { askConfirmFor: resolution.ask.confirmFor } : {}),
    chainTools: state.pending.flatMap((p) => (p.kind === 'chain' ? p.tools : [])),
    approvalTools: state.approvals.map((a) => a.tool),
    goalTools: state.goal?.kind === 'make_post' ? ['start_generation', 'apply_default_workflow'] : [],
  };
}

/** Channels with a connect in progress (OAuth or RedNote QR). */
export function pendingConnectChannels(state: ChatSessionState): string[] {
  return [...new Set(state.pending.flatMap((p) => (p.kind === 'connect' ? [p.channel] : [])))];
}

/** Normalized post requests that already started a run (repeat-request guard). */
export function startedPostRequests(state: ChatSessionState): string[] {
  const keys = [
    ...state.recent.flatMap((r) => (r.key ? [r.key] : [])),
    ...state.pending.flatMap((p) => (p.kind === 'run' && p.request ? [p.request] : [])),
  ];
  return [...new Set(keys)];
}

function describePending(p: PendingItem, answered: boolean): string {
  switch (p.kind) {
    case 'ask':
      return `ask t${p.turn} "${clip(p.question, 70)}" [${p.optionIds.join('/')}]${p.confirmFor ? ` for ${p.confirmFor}` : ''}${answered ? ' - the latest message answers it' : ''}`;
    case 'connect':
      return `${p.channel} connect started t${p.turn} - on "done" check_channel_auth, then continue the goal`;
    case 'run':
      return `run ${p.pipelineId} started t${p.turn}${p.announced ? ', result announced' : ', result not announced yet'}`;
    case 'chain':
      return p.source === 'not_run'
        ? `NOT DONE yet (from t${p.turn}): ${p.tools.join(', ')} - runs only if the user says yes/continue`
        : `confirmed plan t${p.turn}: ${p.tools.join(', ')}`;
  }
}

function describeApproval(a: Approval): string {
  const args = a.args ?? {};
  const bits = [`t${a.confirmedTurn}`];
  if (a.contentId) bits.push(`content ${a.contentId}`);
  if (Array.isArray(args.channels) && args.channels.length) bits.push(args.channels.filter(isStr).join('+'));
  if (isStr(args.url) && args.url) bits.push(args.url);
  return `${a.tool} confirmed (${bits.join(', ')})`;
}

/**
 * The "Session state" prompt block (<= SESSION_STATE_MAX_CHARS). Sections
 * are left out when empty; returns '' when there is nothing to say.
 * `answeredAsk` = the card the user's latest message answers.
 * `minimal` (onboarding): goal and pending ask only.
 */
export function renderSessionState(
  state: ChatSessionState,
  opts: { answeredAsk?: PendingAsk | null; firstOption?: string; minimal?: boolean } = {},
): string {
  const header = '## Session state (server-kept; earlier turns)';
  const answered = opts.answeredAsk ? describePending(opts.answeredAsk, true) : null;
  const pendingItems = [
    ...(answered ? [opts.firstOption ? `${answered}: the first option "${clip(opts.firstOption, 60)}"` : answered] : []),
    ...state.pending.filter((p) => !opts.minimal || p.kind === 'ask').map((p) => describePending(p, false)),
  ];
  const goal = state.goal ? `Goal: ${state.goal.kind}${state.goal.detail ? ` "${clip(state.goal.detail, 60)}"` : ''} (t${state.goal.turn})` : null;
  const resumeGoal =
    !!state.goal &&
    (state.goal.kind === 'make_post' || state.goal.kind === 'publish') &&
    (!!opts.answeredAsk || state.stage === 'no_brand' || state.stage === 'brand_no_workflow');
  const build = (recent: ChatSessionState['recent'], choices: ChatSessionState['choices']) => {
    const lines: string[] = [];
    if (!opts.minimal && state.stage) lines.push(`Stage: ${state.stage}`);
    if (goal) lines.push(goal);
    if (resumeGoal) {
      lines.push('Goal not done - after handling this answer, continue the Goal (do not stop after brand create/update alone).');
    }
    if (pendingItems.length) lines.push(`Pending: ${pendingItems.join('; ')}`);
    if (!opts.minimal && state.approvals.length) lines.push(`Approvals: ${state.approvals.map(describeApproval).join('; ')}`);
    if (!opts.minimal && choices.length) lines.push(`Choices: ${choices.map((c) => `${c.key}=${c.value} (t${c.turn})`).join('; ')}`);
    if (!opts.minimal && recent.length) lines.push(`Done: ${recent.map((r) => `t${r.turn} ${r.text}`).join('; ')}`);
    return lines;
  };
  let recent = state.recent;
  let choices = state.choices;
  const lines = build(recent, choices);
  const onlyStage = lines.length === 1 && lines[0].startsWith('Stage:');
  if (!lines.length || (onlyStage && state.turn === 0)) return '';
  let text = [header, ...lines].join('\n');
  // Over budget: drop the oldest "Done" lines, then the oldest choices, then cut.
  while (text.length > SESSION_STATE_MAX_CHARS && recent.length) {
    recent = recent.slice(1);
    text = [header, ...build(recent, choices)].join('\n');
  }
  while (text.length > SESSION_STATE_MAX_CHARS && choices.length) {
    choices = choices.slice(1);
    text = [header, ...build(recent, choices)].join('\n');
  }
  if (text.length > SESSION_STATE_MAX_CHARS) text = `${text.slice(0, SESSION_STATE_MAX_CHARS - 1).trimEnd()}…`;
  return text;
}
