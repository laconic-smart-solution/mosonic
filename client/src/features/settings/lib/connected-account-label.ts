import type { ZernioConnectedAccount } from "@/shared/types/zernio.type"

/** Internal synthetic id (`rednote` / `rednote:<userId>`) — never show as the username. */
export function isSyntheticRedNoteAccountId(value: string): boolean {
  const v = value.trim().toLowerCase()
  return v === "rednote" || v.startsWith("rednote:")
}

/**
 * Prefer display name, then @username, then raw account id.
 * Skips synthetic RedNote account ids that are not real profile handles.
 */
export function formatConnectedAccountLabel(
  account: Pick<ZernioConnectedAccount, "accountId" | "displayName" | "username">,
): string {
  const displayRaw = account.displayName?.trim()
  const userRaw = account.username?.trim()
  const display =
    displayRaw && !isSyntheticRedNoteAccountId(displayRaw)
      ? displayRaw
      : undefined
  const rawUser =
    userRaw && !isSyntheticRedNoteAccountId(userRaw) ? userRaw : undefined

  // RedNote nicknames are often CJK; don't force an Instagram-style @ prefix.
  const isRedNote = isSyntheticRedNoteAccountId(account.accountId)
  const user = rawUser
    ? isRedNote || rawUser.startsWith("@")
      ? rawUser
      : `@${rawUser}`
    : undefined

  if (
    display &&
    user &&
    display.toLowerCase() !== rawUser?.replace(/^@/, "").toLowerCase()
  ) {
    return `${display} · ${user}`
  }
  if (display) return display
  if (user) return user

  const id = account.accountId?.trim()
  if (id && !isSyntheticRedNoteAccountId(id)) return id
  return ""
}
