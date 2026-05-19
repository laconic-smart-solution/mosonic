export type BranchChannelHandle = {
  id: string
  label: string
}

export type RuleChannelEntry = {
  channel: string
  contentStyle?: string
}

export type BranchNodeConfig = {
  mode?: "rule_channels" | "manual" | "ab_test"
  channelIds?: string[]
  variants?: Array<{ id: string; weight?: number; channel?: string }>
}

export function normalizeLaneId(channel: string): string {
  return channel.trim().toLowerCase()
}

function toHandle(entry: RuleChannelEntry): BranchChannelHandle {
  const label = entry.channel.trim()
  return { id: normalizeLaneId(label), label }
}

function resolveRuleChannels(
  branchConfig: BranchNodeConfig,
  ruleChannels: RuleChannelEntry[],
): RuleChannelEntry[] {
  if (branchConfig.mode === "manual" && branchConfig.channelIds?.length) {
    const wanted = new Set(
      branchConfig.channelIds.map((c) => normalizeLaneId(c)),
    )
    return ruleChannels.filter((ch) => wanted.has(normalizeLaneId(ch.channel)))
  }
  return ruleChannels
}

/**
 * Resolves channel handles for Branch/Merge preview UI (mirrors server materialization).
 */
export function resolveBranchChannels(
  ruleChannels: RuleChannelEntry[] | undefined | null,
  branchConfig: BranchNodeConfig | undefined | null,
): BranchChannelHandle[] {
  const channels = ruleChannels ?? []
  const config = branchConfig ?? { mode: "rule_channels" as const }

  if (config.mode === "ab_test" && config.variants?.length) {
    const seen = new Set<string>()
    const handles: BranchChannelHandle[] = []
    for (const variant of config.variants) {
      const match =
        channels.find(
          (ch) =>
            normalizeLaneId(ch.channel) ===
            normalizeLaneId(variant.channel ?? ch.channel),
        ) ?? channels[0]
      if (!match) continue
      const handle = toHandle(match)
      if (seen.has(handle.id)) continue
      seen.add(handle.id)
      handles.push(handle)
    }
    return handles
  }

  return resolveRuleChannels(config, channels).map(toHandle)
}

export function findBranchNodeConfig(
  nodes: Array<{ type: string; config?: Record<string, unknown> }>,
): BranchNodeConfig | null {
  const branch = nodes.find(
    (n) => n.type === "branch" || n.type === "branchNode",
  )
  if (!branch) return null
  return (branch.config ?? {}) as BranchNodeConfig
}
