import type { AccountChannelDef } from "@/features/settings/constants/account-channels"
import type { ZernioConnectedAccount } from "@/shared/types/zernio.type"

export function buildAccountChannelMap(
  accounts: ZernioConnectedAccount[] | undefined,
): Record<string, ZernioConnectedAccount> {
  const map: Record<string, ZernioConnectedAccount> = {}
  for (const item of accounts ?? []) {
    const k = item.channel.trim().toLowerCase()
    if (k) map[k] = item
  }
  return map
}

export function findConnectedForChannel(
  def: AccountChannelDef,
  byChannel: Record<string, ZernioConnectedAccount>,
): ZernioConnectedAccount | undefined {
  for (const key of def.matchKeys) {
    const acc = byChannel[key]
    if (acc) return acc
  }
  return undefined
}

export function isChannelAllowedByPlan(
  def: AccountChannelDef,
  allowedChannels: readonly string[] | undefined,
): boolean {
  const allowed = new Set(
    (allowedChannels ?? []).map((channel) => channel.trim().toLowerCase()),
  )
  return def.matchKeys.some((key) => allowed.has(key))
}
