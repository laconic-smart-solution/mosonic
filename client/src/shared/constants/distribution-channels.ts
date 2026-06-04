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

export function normalizeChannelId(channel: string): string {
  return channel.trim().toLowerCase()
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
    const id = normalizeChannelId(raw)
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
    const id = normalizeChannelId(row.channel ?? "")
    if (!id || seen.has(id) || !LABEL_BY_ID.has(id)) continue
    seen.add(id)
    ids.push(id)
  }
  return ids
}
