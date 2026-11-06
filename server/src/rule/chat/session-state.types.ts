/**
 * Per-session chat state, kept by code (never by the model) and stored as a
 * snapshot on each assistant row (`chat_messages.state`). See
 * session-state.util.ts for the reducers and docs in the plan
 * (structured per-session chat state).
 */
export const SESSION_STATE_VERSION = 1;

/** Derived from Live state every turn; the stored copy is only a debugging snapshot. */
export type ChatStage =
  | 'no_brand'
  | 'brand_no_workflow'
  | 'workflow_no_post'
  | 'run_active'
  | 'post_ready'
  | 'post_published';

export type PendingAsk = {
  kind: 'ask';
  turn: number;
  question: string;
  optionIds: string[];
  /** Parallel to optionIds, lower-cased; lets a typed label ("use it") resolve the ask. */
  optionLabels?: string[];
  confirmFor?: string;
  /** Args of the blocked call a confirmation card stands for. */
  args?: Record<string, unknown>;
  /**
   * Tools implied by a capability plan.willChange (e.g. add_workflow_node, start_generation).
   * On Yes / start_post, become the pending plan chain so the model must run them.
   */
  willChangeTools?: string[];
};
export type PendingConnect = { kind: 'connect'; turn: number; channel: string; via: 'oauth' | 'qr' };
export type PendingRun = {
  kind: 'run';
  turn: number;
  pipelineId: string;
  announced: boolean;
  /** Epoch ms when it started (runs are dropped after RUN_WATCH_TTL_SEC). */
  at?: number;
  /** Normalized post request that started it (repeat-request guard). */
  request?: string;
};
/**
 * A chain of change tools allowed past the per-round budget.
 * - source 'plan' (or absent, legacy): a confirmed "set up, then start the post" plan (start_post chip).
 * - source 'not_run': changes this request still needs that did not run (budget or a stop);
 *   a Yes / continue / allow-once on the next message runs them, anything else drops them.
 */
export type PendingChain = { kind: 'chain'; turn: number; tools: string[]; source?: 'plan' | 'not_run' };

export type PendingItem = PendingAsk | PendingConnect | PendingRun | PendingChain;

export type Approval = {
  /** e.g. publish_now, fetch_website_assets */
  tool: string;
  /** Stable key of the args that matter (channel(s), url, contentId). */
  argsKey: string;
  /** The confirmed call's args, compared with matchesCarriedConfirmation's rules. */
  args?: Record<string, unknown>;
  /** Channels connected after the confirmation (a channel-less call may narrow to these). */
  detourChannels?: string[];
  /** Bound to the Latest post at confirm time. */
  contentId?: string;
  confirmedTurn: number;
  /** confirmedTurn + MAX_CONNECT_DETOUR_TURNS */
  expiresTurn: number;
};

/** Acceptance criteria for the active goal — independent of the latest tool call. */
export type GoalAcceptance = {
  /** Target distribution channels (normalized lane ids). */
  channels?: string[];
  /** Distinct images expected on the draft / upload (e.g. 4 service images). */
  imageCount?: number;
  /** After draft is ready, ask before publish. */
  askPublish?: boolean;
  /** Plain-language criteria for UI / verifier. */
  criteria?: string[];
};

export type ChatGoal = {
  kind: 'make_post' | 'publish' | 'setup_brand' | 'edit_workflow';
  detail?: string;
  turn: number;
  /** What “done” means. Saving preferences alone never satisfies a make_post goal. */
  acceptance?: GoalAcceptance;
  /** Set only after postconditions verified (artifacts exist). */
  satisfied?: boolean;
};

export type ChatSessionState = {
  v: typeof SESSION_STATE_VERSION;
  /** User-turn counter (follow-ups do not bump it). */
  turn: number;
  /** Snapshot for debugging; recomputed on read. */
  stage: ChatStage;
  goal?: ChatGoal;
  /** max 4 */
  pending: PendingItem[];
  /** max 3 */
  approvals: Approval[];
  /** e.g. website=skip; max 8 */
  choices: { key: string; value: string; turn: number }[];
  /**
   * One line per mutating/important tool result; max 6, each <=120 chars.
   * `key` = the normalized post request a pipeline_started line came from.
   */
  recent: { turn: number; text: string; key?: string }[];
};
