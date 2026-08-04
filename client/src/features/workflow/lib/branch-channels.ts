import {
  channelIdsToHandles,
  resolveDistributionChannelId,
  ruleChannelNamesToIds,
} from "@/shared/constants/distribution-channels"

export type BranchChannelHandle = {
  id: string
  label: string
}

export type RuleChannelEntry = {
  channel: string
  contentStyle?: string
}

export type BranchNodeConfig = {
  mode?: "rule_channels" | "wizard_channels"
  /** Explicit channel id subset when mode is "wizard_channels". */
  channels?: string[]
}

export const RULE_CHANNELS_BRANCH_CONFIG: BranchNodeConfig = {
  mode: "rule_channels",
}

/** Canonical lane / merge-handle id (matches server `normalizeLaneId`). */
export function normalizeLaneId(lane: string): string {
  return resolveDistributionChannelId(lane)
}

/**
 * Resolves the *active* channel handles for Branch/Merge UI. Branching is
 * optional and a workflow may intentionally run fewer — or different —
 * channels than the Rule defines. An explicit "wizard_channels" selection is
 * trusted outright, same as the server (`channelIdsToChannelEntries` doesn't
 * require the channel to be on the Rule either); with no explicit selection,
 * every Rule channel is active (the historical default).
 */
export function resolveBranchChannels(
  branchConfig: BranchNodeConfig | undefined | null,
  ruleChannels?: RuleChannelEntry[] | null,
): BranchChannelHandle[] {
  if (
    branchConfig?.mode === "wizard_channels" &&
    Array.isArray(branchConfig.channels) &&
    branchConfig.channels.length > 0
  ) {
    return channelIdsToHandles(branchConfig.channels)
  }
  return channelIdsToHandles(ruleChannelNamesToIds(ruleChannels ?? []))
}

/**
 * Same selection logic as {@link resolveBranchChannels}, but operating
 * directly on an already-resolved handle list (e.g. at apply-time in the
 * canvas, where the full channel catalog is already on hand as handles).
 */
export function filterChannelsBySelection(
  allChannels: BranchChannelHandle[],
  branchConfig: BranchNodeConfig | undefined | null,
): BranchChannelHandle[] {
  if (
    branchConfig?.mode === "wizard_channels" &&
    Array.isArray(branchConfig.channels) &&
    branchConfig.channels.length > 0
  ) {
    const selected = new Set(branchConfig.channels.map(normalizeLaneId))
    const filtered = allChannels.filter((c) => selected.has(c.id))
    if (filtered.length > 0) return filtered
  }
  return allChannels
}

/** Normalizes persisted branch config to rule-driven mode. */
export function migrateBranchConfigFromRule(
  _config: BranchNodeConfig,
  _ruleChannels: RuleChannelEntry[] | undefined | null,
): BranchNodeConfig {
  return { mode: "rule_channels" }
}

export function findBranchNodeConfig(
  nodes: Array<{ type: string; config?: Record<string, unknown> }>,
): BranchNodeConfig | null {
  const branch = nodes.find(
    (n) => n.type === "branch" || n.type === "branchNode",
  )
  if (!branch) return null
  return { mode: "rule_channels" }
}
