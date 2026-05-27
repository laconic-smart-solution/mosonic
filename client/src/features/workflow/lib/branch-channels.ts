import {
  channelIdsToHandles,
  normalizeChannelId,
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
  mode?: "rule_channels"
}

export const RULE_CHANNELS_BRANCH_CONFIG: BranchNodeConfig = {
  mode: "rule_channels",
}

/** Canonical lane / merge-handle id (matches server `normalizeLaneId`). */
export function normalizeLaneId(lane: string): string {
  return normalizeChannelId(lane)
}

/**
 * Resolves channel handles for Branch/Merge UI from the campaign rule channels.
 */
export function resolveBranchChannels(
  _branchConfig: BranchNodeConfig | undefined | null,
  ruleChannels?: RuleChannelEntry[] | null,
): BranchChannelHandle[] {
  if (!ruleChannels?.length) return []
  return channelIdsToHandles(ruleChannelNamesToIds(ruleChannels))
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
