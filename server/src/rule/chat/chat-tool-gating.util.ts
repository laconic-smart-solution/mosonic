/**
 * Picks the tools bound for one rule-aware chat turn. Binding every schema on
 * every turn costs tokens and gives the model more ways to pick the wrong
 * tool, so tools are grouped by intent and only the groups this turn needs
 * are sent (target: about 15 per turn).
 *
 * intentText = the user's latest message + the previous assistant reply and
 * the tool names it used, so a chip answer keeps the group it continues.
 */
import type { StatePending } from './session-state.util';
import { BLANK_BRAND_BLOCKED_TOOLS } from './blank-brand.util';

export const CORE_TOOLS = ['ask_user', 'get_rule', 'update_rule', 'remember', 'list_workflows'] as const;

const GROUPS: { tools: string[]; when: RegExp; needsWorkflow?: boolean; orActiveRun?: boolean }[] = [
  {
    tools: ['search_brand_assets', 'list_brand_assets', 'request_asset_upload', 'fetch_website_assets', 'ingest_website_content'],
    // Media for the publish draft comes from these assets; add_upload_media is in the publish group.
    when: /(asset|logo|photo|image|picture|pic\b|website|https?:\/\/|www\.|\.com|upload|file|\[\[asset|fetch_website_assets|ingest_website_content|list_brand_assets|search_brand_assets)/i,
  },
  {
    tools: ['forget', 'forget_all', 'search_brand_memory'],
    when: /(remember|forget|memor|note|never|always|prefer|style|remove everything|forget_all|search_brand_memory)/i,
  },
  { tools: ['web_search'], when: /(search|news|trend|latest|today|this week|competitor|web_search)/i },
  {
    tools: ['generate_workflow', 'apply_default_workflow'],
    when: /(workflow|default|set ?up|setup|\bstart\b|\bgo\b|get started|campaign|apply_default_workflow|generate_workflow|no_workflow)/i,
  },
  {
    tools: ['get_node_config', 'describe_node_config_fields', 'preview_generation', 'update_node_config', 'reorder_workflow_nodes', 'remove_workflow_node', 'add_workflow_node', 'set_workflow_channels'],
    needsWorkflow: true,
    // Bare channel names are not here: "publish to facebook" is not a lane edit.
    when: /(workflow|step|node|\b(re)?order\b|remove|\badd\b|delete|lane|\bchannels?\b|image|text only|move|simpl|\btoo\b|\balso\b|instead|switch|only|prompt|setting|config|style|preview|what will|duration|voice|aspect|preview_generation|describe_node_config_fields|no_image_step|image_step_present|_workflow_node|set_workflow_channels|update_node_config)/i,
  },
  {
    // No workflow needed: start_generation sets up the default one itself.
    tools: ['start_generation'],
    when: /(post|content|generat|make|create|announce|launch|campaign|write|\brun\b|photo|\bstart\b|\byes\b|\bdo\b|\bok(ay)?\b|\bgo\b|\u0e42\u0e1e\u0e2a\u0e15\u0e4c|\u0e17\u0e33|start_generation)/i,
  },
  {
    // Video generate-more (expensive; also confirmation-gated in tool-guards).
    tools: ['get_content', 'get_draft_media_status', 'generate_presenter_video', 'generate_cinematic_video', 'get_node_config', 'describe_node_config_fields', 'list_heygen_looks', 'list_heygen_voices', 'set_video_node_look'],
    needsWorkflow: true,
    when: /(video|reel|clip|footage|presenter|avatar|spokes|talking|cinematic|sora|heygen|b-?roll|\u0e27\u0e34\u0e14\u0e35\u0e42\u0e2d|\u89c6\u9891|generate_presenter_video|generate_cinematic_video|presenter_setup_required|cinematic_avatar_required|\blooks?\b|portrait|list_heygen_looks|list_heygen_voices|set_video_node_look|get_draft_media_status|\bvoices?\b)/i,
  },
  {
    tools: ['list_pipelines', 'get_active_pipeline', 'get_pipeline_status', 'cancel_pipeline', 'get_pipeline_logs'],
    needsWorkflow: true,
    orActiveRun: true,
    when: /(\brun(s|ning)?\b|status|progress|cancel|stop|\blogs?\b|\bgoing\b|where|hurry|slow|done|finish|wait|ready|error|fail|pipeline|get_pipeline_status|cancel_pipeline)/i,
  },
  {
    tools: ['list_contents', 'get_content', 'save_content', 'edit_content', 'approve_content', 'reject_content', 'rerun_content_node', 'generate_more_image', 'generate_more_translation', 'generate_more_summary', 'generate_more_adapt'],
    needsWorkflow: true,
    when: /(draft|caption|content|approve|reject|rerun|re-run|redo|again|shorter|longer|edit|change|rewrite|replace|hashtag|wording|text|translat|summar|more|show|see|where|result|logo|darker|brighter|get_content|edit_content|approve_content|reject_content|rerun_content_node|generate_more)/i,
  },
  {
    tools: ['list_contents', 'get_content', 'get_upload', 'preview_upload', 'publish_now', 'schedule_publish', 'reschedule_publish', 'cancel_schedule', 'retry_publish', 'edit_upload_channel'],
    needsWorkflow: true,
    when: /(publish|schedule|reschedul|postpone|move it|unschedul|upload|post it|share it|go live|preview|ready to post|check before|youtube title|exclude|include|skip (instagram|facebook|linkedin|youtube|tiktok|rednote)|retry|failed|get_upload|preview_upload|publish_now|schedule_publish|reschedule_publish|cancel_schedule|retry_publish|edit_upload_channel)/i,
  },
  {
    // Upload media: chat attachments / brand assets onto the publish draft.
    tools: ['get_upload', 'add_upload_media', 'remove_upload_media', 'list_brand_assets'],
    needsWorkflow: true,
    when: /(media|attach|this (photo|image|picture|video)|my (photo|image|picture|video)|use (this|that|my|the) (photo|image|picture|video|logo)|add (a |the |my )?(photo|image|picture|video|logo)|remove (the |that )?(photo|image|picture|video|media)|\[\[asset|add_upload_media|remove_upload_media|no_media|needs an image)/i,
  },
  {
    tools: ['list_channels', 'check_channel_auth', 'start_channel_oauth'],
    when: /(connect|oauth|account|auth|publish|schedule|channel|login|log in|sign in|upload|post|share|list_channels|check_channel|start_channel)/i,
  },
  {
    tools: ['list_posts', 'get_post', 'get_post_analytics'],
    when: /(analytics|metric|views|likes|reach|engagement|perform|retry|failed post|posted|published|went live|list_posts|get_post|retry_publish)/i,
  },
  {
    // retry_publish takes a postId too, so it is bound without a workflow when a failed post is the topic.
    tools: ['retry_publish'],
    when: /(retry|try again|failed post|failed publish|retry_publish)/i,
  },
  {
    tools: ['suggest_rule_improvement', 'apply_rule_suggestion'],
    when: /(suggestion|suggest|improve|better|tips?\b|suggest_rule_improvement|apply_rule_suggestion)/i,
  },
];

export function selectChatTools(
  intentText: string,
  state: { hasWorkflow: boolean; hasActiveRun: boolean; brandReady?: boolean },
): Set<string> {
  const allowed = new Set<string>(CORE_TOOLS);
  for (const group of GROUPS) {
    if (group.needsWorkflow && !state.hasWorkflow) continue;
    if (group.when.test(intentText) || (group.orActiveRun && state.hasActiveRun)) {
      for (const name of group.tools) allowed.add(name);
    }
  }
  if (!state.hasWorkflow) {
    allowed.add('generate_workflow');
    allowed.add('apply_default_workflow');
  }

  // When brand is not ready, strictly prevent content generation and workflow setup tools
  if (state.brandReady === false) {
    for (const blocked of BLANK_BRAND_BLOCKED_TOOLS) {
      allowed.delete(blocked);
    }
    allowed.add('ingest_website_content');
    allowed.add('fetch_website_assets');
  }

  return allowed;
}

/** How much of the previous reply feeds intent: its closing question/offer, not the whole recap. */
const PREVIOUS_REPLY_TAIL_CHARS = 200;

/** The reply's closing question when it ends with one, else its last 200 chars. */
function replyTail(content: string): string {
  const trimmed = content.trim();
  const question = /[^.!?\n]*[?\uFF1F]$/.exec(trimmed);
  return question ? question[0].trim() : trimmed.slice(-PREVIOUS_REPLY_TAIL_CHARS);
}

/** Latest user text + the end of the previous assistant reply and its tool names. */
export function buildIntentText(history: { role: string; content: string; steps?: unknown }[]): string {
  const parts: string[] = [];
  const last = history[history.length - 1];
  if (last?.role === 'user') parts.push(last.content);
  const prev = history[history.length - 2];
  if (prev?.role === 'assistant') {
    // A long recap ("I set up…, posted…, you can also…") matched almost every
    // group; the offer the user is answering sits at the end of the reply.
    parts.push(replyTail(prev.content));
    if (Array.isArray(prev.steps)) {
      for (const s of prev.steps as { name?: unknown; result?: unknown }[]) {
        if (typeof s?.name === 'string') parts.push(s.name);
        if (typeof s?.result === 'string') {
          const code = /"code":"([a-z_]+)"/.exec(s.result);
          if (code) parts.push(code[1]);
        }
      }
    }
  }
  return parts.join('\n');
}

const WORKFLOW_STATE_TOOLS = new Set(['get_node_config', 'describe_node_config_fields', 'preview_generation', 'list_heygen_voices', 'update_node_config', 'list_heygen_looks', 'set_video_node_look', 'reorder_workflow_nodes', 'remove_workflow_node', 'add_workflow_node', 'set_workflow_channels', 'list_pipelines', 'get_active_pipeline', 'get_pipeline_status', 'cancel_pipeline', 'get_pipeline_logs']);
const CONTENT_STATE_TOOLS = new Set([
  'list_contents',
  'get_content',
  'get_draft_media_status',
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
  'get_upload',
  'publish_now',
  'schedule_publish',
  'preview_upload',
  'edit_content',
  'add_upload_media',
  'remove_upload_media',
  'edit_upload_channel',
  'reschedule_publish',
  'cancel_schedule',
]);

/**
 * Tools by state, not by guessed intent: a workflow unlocks workflow/run tools,
 * a post in this chat unlocks content tools. get_rule is never bound (the
 * profile is already in the prompt).
 */
export function selectToolsByState(state: { hasWorkflow: boolean; hasContent: boolean }): (name: string) => boolean {
  return (name) => {
    if (name === 'get_rule') return false;
    if (CONTENT_STATE_TOOLS.has(name)) return state.hasContent;
    if (WORKFLOW_STATE_TOOLS.has(name)) return state.hasWorkflow;
    return true;
  };
}

const CONNECT_FLOW_TOOLS = ['check_channel_auth', 'start_channel_oauth', 'list_channels'];

/**
 * Tools a flow already in progress needs this turn, whatever the user typed:
 * the tool a confirmation card was asking about, the connect tools after an
 * OAuth start, a confirmed action carried over a connect detour, and a
 * confirmed plan chain. ask_user is always kept.
 */
export function pendingFlowTools(
  history: { role: string; content: string; steps?: unknown }[],
  extra: {
    carriedTool?: string | null;
    chain?: ReadonlySet<string> | null;
    /** From the session state: survives follow-up rows and off-topic turns. */
    statePending?: StatePending | null;
  } = {},
): Set<string> {
  const keep = new Set<string>(['ask_user']);
  const prev = history[history.length - 2];
  if (prev?.role === 'assistant' && Array.isArray(prev.steps)) {
    for (const s of prev.steps as { type?: unknown; result?: unknown }[]) {
      if (s?.type !== 'observation' || typeof s.result !== 'string') continue;
      let payload: { action?: unknown; confirmFor?: unknown } | null = null;
      try {
        payload = JSON.parse(s.result) as { action?: unknown; confirmFor?: unknown };
      } catch {
        continue;
      }
      if (typeof payload?.confirmFor === 'string') keep.add(payload.confirmFor);
      if (payload?.action === 'start_oauth' || payload?.action === 'start_rednote_qr') {
        for (const name of CONNECT_FLOW_TOOLS) keep.add(name);
      }
    }
  }
  if (extra.carriedTool) {
    keep.add(extra.carriedTool);
    keep.add('get_upload');
    keep.add('preview_upload');
    for (const name of CONNECT_FLOW_TOOLS) keep.add(name);
  }
  for (const name of extra.chain ?? []) keep.add(name);
  const sp = extra.statePending;
  if (sp) {
    if (sp.askConfirmFor) keep.add(sp.askConfirmFor);
    if (sp.connect) for (const name of CONNECT_FLOW_TOOLS) keep.add(name);
    for (const name of sp.chainTools) keep.add(name);
    for (const name of sp.goalTools ?? []) keep.add(name);
    if (sp.approvalTools.length) {
      for (const name of sp.approvalTools) keep.add(name);
      keep.add('get_upload');
      keep.add('preview_upload');
      for (const name of CONNECT_FLOW_TOOLS) keep.add(name);
    }
  }
  return keep;
}

/**
 * Final per-turn tool filter: state gate (selectToolsByState) AND either the
 * intent groups (selectChatTools) or a pending flow (pendingFlowTools).
 */
export function selectTurnTools(
  intentText: string,
  state: { hasWorkflow: boolean; hasContent: boolean; hasActiveRun: boolean; brandReady?: boolean },
  keep: ReadonlySet<string> = new Set(),
): (name: string) => boolean {
  const byState = selectToolsByState(state);
  const byIntent = selectChatTools(intentText, state);
  return (name) => byState(name) && (byIntent.has(name) || keep.has(name));
}
