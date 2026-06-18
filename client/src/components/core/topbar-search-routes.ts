export type TopbarSearchRouteEntry = {
  id: string
  path: string
  titleKey: string
  subtitleKey: string
  keywordsKey: string
}

export const TOPBAR_SEARCH_ROUTE_DEFS: TopbarSearchRouteEntry[] = [
  {
    id: "dashboard",
    path: "/dashboard",
    titleKey: "searchRoutes.dashboard.title",
    subtitleKey: "searchRoutes.dashboard.subtitle",
    keywordsKey: "searchRoutes.dashboard.keywords",
  },
  {
    id: "rules",
    path: "/rules",
    titleKey: "searchRoutes.rules.title",
    subtitleKey: "searchRoutes.rules.subtitle",
    keywordsKey: "searchRoutes.rules.keywords",
  },
  {
    id: "content",
    path: "/content",
    titleKey: "searchRoutes.content.title",
    subtitleKey: "searchRoutes.content.subtitle",
    keywordsKey: "searchRoutes.content.keywords",
  },
  {
    id: "pipelines",
    path: "/pipelines",
    titleKey: "searchRoutes.pipelines.title",
    subtitleKey: "searchRoutes.pipelines.subtitle",
    keywordsKey: "searchRoutes.pipelines.keywords",
  },
  {
    id: "settings-accounts",
    path: "/settings/accounts",
    titleKey: "searchRoutes.settingsAccounts.title",
    subtitleKey: "searchRoutes.settingsAccounts.subtitle",
    keywordsKey: "searchRoutes.settingsAccounts.keywords",
  },
  {
    id: "posts",
    path: "/posts",
    titleKey: "searchRoutes.posts.title",
    subtitleKey: "searchRoutes.posts.subtitle",
    keywordsKey: "searchRoutes.posts.keywords",
  },
]

export type ResolvedTopbarSearchRoute = {
  id: string
  path: string
  title: string
  subtitle: string
  keywords: readonly string[]
}

export function resolveTopbarSearchRoutes(
  defs: readonly TopbarSearchRouteEntry[],
  t: (key: string) => string,
): ResolvedTopbarSearchRoute[] {
  return defs.map((entry) => ({
    id: entry.id,
    path: entry.path,
    title: t(entry.titleKey),
    subtitle: t(entry.subtitleKey),
    keywords: t(entry.keywordsKey).split(/\s+/).filter(Boolean),
  }))
}

function normalize(text: string): string {
  return text.trim().toLowerCase()
}

export function entryMatchesTopbarQuery(
  entry: ResolvedTopbarSearchRoute,
  q: string,
): boolean {
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
  entries: readonly ResolvedTopbarSearchRoute[],
  query: string,
): ResolvedTopbarSearchRoute[] {
  return entries.filter((e) => entryMatchesTopbarQuery(e, query))
}
