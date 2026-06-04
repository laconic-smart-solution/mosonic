import type { User } from "@/shared/types/user.type"

/** Map Nest JWT guard `localUser` (Mongo User) to UI `User` type. */
export function mapLocalUserToUser(localUser: {
  userId?: string
  email?: string
  username?: string
  firstName?: string
  lastName?: string
  role?: string
  avatarUrl?: string
}): User {
  const name =
    [localUser.firstName, localUser.lastName].filter(Boolean).join(" ").trim() ||
    localUser.username?.trim() ||
    localUser.email?.trim() ||
    ""

  return {
    id: localUser.userId ?? "",
    name,
    email: localUser.email ?? "",
    roleName: localUser.role ?? "",
    avatarUrl:
      typeof localUser.avatarUrl === "string" && localUser.avatarUrl.trim()
        ? localUser.avatarUrl.trim()
        : undefined,
  }
}
