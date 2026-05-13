export type TopbarSearchRouteEntry = {
  id: string
  path: string
  title: string
  subtitle: string
  keywords: readonly string[]
}

export const TOPBAR_SEARCH_ROUTES: TopbarSearchRouteEntry[] = [
  {
    id: "dashboard",
    path: "/dashboard",
    title: "Dashboard",
    subtitle: "App overview",
    keywords: ["dashboard", "home", "overview", "start"],
  },
  {
    id: "rules",
    path: "/rules",
    title: "Rules",
    subtitle: "Campaign rules",
    keywords: ["rules", "campaigns", "setup"],
  },
  {
    id: "content",
    path: "/content",
    title: "Content",
    subtitle: "Content library",
    keywords: ["content", "library", "posts", "items"],
  },
  {
    id: "settings-accounts",
    path: "/settings/accounts",
    title: "Account settings",
    subtitle: "Linked accounts",
    keywords: ["settings", "account", "profile", "users"],
  },
  {
    id: "analytics",
    path: "/analytics",
    title: "Analytics",
    subtitle: "Metrics and reports",
    keywords: ["analytics", "metrics", "stats"],
  },
]

function normalize(text: string): string {
  return text.trim().toLowerCase()
}

export function entryMatchesTopbarQuery(entry: TopbarSearchRouteEntry, q: string): boolean {
  const n = normalize(q)
  if (!n) return true

  const haystacks = [
    entry.title,
    entry.subtitle,
    entry.path.replace(/\//g, " "),
    ...entry.keywords,
  ].map(normalize)

  const tokens = n.split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return true

  return tokens.every((token) => haystacks.some((h) => h.includes(token)))
}

export function filterTopbarSearchRoutes(
  entries: readonly TopbarSearchRouteEntry[],
  query: string
): TopbarSearchRouteEntry[] {
  return entries.filter((e) => entryMatchesTopbarQuery(e, query))
}
