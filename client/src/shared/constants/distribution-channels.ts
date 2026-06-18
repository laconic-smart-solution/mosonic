export type DistributionChannel = {
  id: string
  label: string
}

/** Fixed platforms for Branch lane selection (independent of Rule). */
export const DISTRIBUTION_CHANNELS: DistributionChannel[] = [
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "twitter", label: "Twitter / X" },
  { id: "youtube", label: "YouTube" },
  { id: "tiktok", label: "TikTok" },
]

const LABEL_BY_ID = new Map(
  DISTRIBUTION_CHANNELS.map((c) => [c.id, c.label] as const),
)

const ID_BY_LABEL = new Map(
  DISTRIBUTION_CHANNELS.map((c) => [c.label.trim().toLowerCase(), c.id] as const),
)

export function normalizeChannelId(channel: string): string {
  return channel.trim().toLowerCase()
}

/** Map rule labels, aliases, or ids to a canonical distribution channel id. */
export function resolveDistributionChannelId(channel: string): string {
  const raw = normalizeChannelId(channel)
  if (!raw) return raw
  if (LABEL_BY_ID.has(raw)) return raw
  const fromLabel = ID_BY_LABEL.get(raw)
  if (fromLabel) return fromLabel
  if (raw.includes("twitter") || raw === "x") return "twitter"
  return raw
}

export function channelLabel(channelId: string): string {
  const id = normalizeChannelId(channelId)
  return LABEL_BY_ID.get(id) ?? titleCaseChannelId(id)
}

function titleCaseChannelId(id: string): string {
  if (!id) return id
  return id.charAt(0).toUpperCase() + id.slice(1)
}

export function channelIdsToHandles(channelIds: string[]): Array<{ id: string; label: string }> {
  const seen = new Set<string>()
  const handles: Array<{ id: string; label: string }> = []
  for (const raw of channelIds) {
    const id = resolveDistributionChannelId(raw)
    if (!id || seen.has(id)) continue
    if (!LABEL_BY_ID.has(id)) continue
    seen.add(id)
    handles.push({ id, label: channelLabel(id) })
  }
  return handles
}

/** Map rule channel names to catalog ids where possible. */
export function ruleChannelNamesToIds(
  ruleChannels: Array<{ channel?: string }> | undefined | null,
): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  for (const row of ruleChannels ?? []) {
    const id = resolveDistributionChannelId(row.channel ?? "")
    if (!id || seen.has(id) || !LABEL_BY_ID.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}
