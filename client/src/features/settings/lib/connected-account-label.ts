import type { ZernioConnectedAccount } from "@/shared/types/zernio.type"

/** Prefer display name, then @username, then raw account id. */
export function formatConnectedAccountLabel(
  account: Pick<ZernioConnectedAccount, "accountId" | "displayName" | "username">,
): string {
  const display = account.displayName?.trim()
  const rawUser = account.username?.trim()
  const user = rawUser
    ? rawUser.startsWith("@")
      ? rawUser
      : `@${rawUser}`
    : undefined

  if (display && user && display.toLowerCase() !== rawUser?.replace(/^@/, "").toLowerCase()) {
    return `${display} · ${user}`
  }
  if (display) return display
  if (user) return user
  return account.accountId
}
