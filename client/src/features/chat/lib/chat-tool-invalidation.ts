import type { QueryClient, QueryKey } from "@tanstack/react-query"

import type { AgentStep } from "@/shared/services/chat.service"

// Prefix keys - invalidateQueries matches every query under them. Literals (not the *QueryKeys
// factories) keep this module free of i18n/socket imports; they mirror usage/posts/zernio.query.ts.
const RULE: QueryKey[] = [["rule"], ["rules"], ["chat-sessions"]]
const ASSETS: QueryKey[] = [["rule-assets"]]
const MEMORY: QueryKey[] = [["rule-memories"]]
const WORKFLOW: QueryKey[] = [["workflow"], ["pipeline", "estimate"], ["pipeline", "review-estimate"]]
const CONTENT: QueryKey[] = [["content"], ["contents"]]
const RUN: QueryKey[] = [["pipeline"], ...CONTENT, ["usage", "summary"], ["usage", "current-plan"], ["usage", "history"]]
const PUBLISH: QueryKey[] = [["upload"], ["posts"], ...CONTENT]
const CHANNELS: QueryKey[] = [["zernio", "accounts"]]

/** Chat agent tools that change server state -> the client caches they make stale. Read-only tools are absent. */
const TOOL_QUERY_KEYS: Record<string, QueryKey[]> = {
  create_rule_from_intake: [...RULE, ...ASSETS, ...WORKFLOW],
  update_rule: RULE,
  apply_rule_suggestion: RULE,
  fetch_website_assets: ASSETS,
  request_asset_upload: ASSETS,
  remember: MEMORY,
  forget: MEMORY,
  forget_all: MEMORY,

  reorder_workflow_nodes: WORKFLOW,
  remove_workflow_node: WORKFLOW,
  add_workflow_node: WORKFLOW,
  set_workflow_channels: WORKFLOW,
  generate_workflow: WORKFLOW,
  apply_default_workflow: WORKFLOW,
  update_node_config: WORKFLOW,

  start_generation: RUN,
  // Synthetic follow-up observation when a chat-started run ends.
  pipeline_result: RUN,
  // Follow-up get_content reveals a newly finished draft — refresh the rail.
  get_content: CONTENT,
  rerun_content_node: RUN,
  generate_more_image: RUN,
  generate_presenter_video: RUN,
  generate_cinematic_video: RUN,
  generate_more_translation: RUN,
  generate_more_summary: RUN,
  generate_more_adapt: RUN,

  save_content: CONTENT,
  edit_content: CONTENT,
  approve_content: [...CONTENT, ["pipeline"], ["upload"]],
  reject_content: [...CONTENT, ["pipeline"]],

  publish_now: PUBLISH,
  schedule_publish: PUBLISH,
  reschedule_publish: PUBLISH,
  cancel_schedule: PUBLISH,
  retry_publish: PUBLISH,
  retry_upload: PUBLISH,
  retry_post: PUBLISH,
  add_upload_media: PUBLISH,
  remove_upload_media: PUBLISH,
  edit_upload_channel: PUBLISH,

  start_channel_oauth: CHANNELS,
  check_channel_auth: CHANNELS,
}

/** Query keys made stale by the finished tool results in `steps` (deduped). */
export function queryKeysForToolSteps(steps: readonly AgentStep[] | null | undefined): QueryKey[] {
  const seen = new Map<string, QueryKey>()
  for (const step of steps ?? []) {
    if (step.type !== "observation" && step.type !== "tool_call") continue
    for (const key of TOOL_QUERY_KEYS[step.name] ?? []) seen.set(JSON.stringify(key), key)
  }
  return [...seen.values()]
}

/** Refetch whatever the chat agent's tools just changed so panels/cards update without a reload. */
export function invalidateForToolSteps(queryClient: QueryClient, steps: readonly AgentStep[] | null | undefined) {
  for (const queryKey of queryKeysForToolSteps(steps)) {
    void queryClient.invalidateQueries({ queryKey })
  }
}
