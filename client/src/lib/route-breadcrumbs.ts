export type BreadcrumbItem = {
  label: string
  href?: string
}

export type RouteBreadcrumbDef = {
  /** React-router-style path pattern, e.g. `/posts/:postId` */
  pattern: string
  /** i18n key resolved at runtime */
  labelKey: string
  /** Namespace for labelKey; defaults to `common` */
  ns?: string
  /** Parent pattern to prepend; omit for root crumbs */
  parent?: string
  /** When true, last segment uses dynamic override label if set */
  dynamic?: boolean
  /** Static href for link crumbs; `:param` tokens replaced from match */
  href?: string
}

/** Ordered most-specific first */
export const ROUTE_BREADCRUMB_DEFS: RouteBreadcrumbDef[] = [
  // Admin detail
  {
    pattern: "/admin/content/:contentId",
    labelKey: "breadcrumb.detail",
    parent: "/admin/content",
    dynamic: true,
    href: "/admin/content/:contentId",
  },
  {
    pattern: "/admin/faq/documents/:documentId",
    labelKey: "breadcrumb.detail",
    parent: "/admin/faq",
    dynamic: true,
    href: "/admin/faq/documents/:documentId",
  },
  {
    pattern: "/admin/users/:userId",
    labelKey: "breadcrumb.detail",
    parent: "/admin/users",
    dynamic: true,
    href: "/admin/users/:userId",
  },
  // Admin list
  {
    pattern: "/admin/dashboard",
    labelKey: "layout.nav.dashboard",
    ns: "admin",
    href: "/admin/dashboard",
    parent: "/admin",
  },
  {
    pattern: "/admin/users",
    labelKey: "layout.nav.users",
    ns: "admin",
    href: "/admin/users",
    parent: "/admin",
  },
  {
    pattern: "/admin/credit",
    labelKey: "layout.nav.credit",
    ns: "admin",
    href: "/admin/credit",
    parent: "/admin",
  },
  {
    pattern: "/admin/node-credits",
    labelKey: "layout.nav.nodeCredits",
    ns: "admin",
    href: "/admin/node-credits",
    parent: "/admin",
  },
  {
    pattern: "/admin/plans",
    labelKey: "layout.nav.plans",
    ns: "admin",
    href: "/admin/plans",
    parent: "/admin",
  },
  {
    pattern: "/admin/usage",
    labelKey: "layout.nav.usage",
    ns: "admin",
    href: "/admin/usage",
    parent: "/admin",
  },
  {
    pattern: "/admin/cost",
    labelKey: "layout.nav.cost",
    ns: "admin",
    href: "/admin/cost",
    parent: "/admin",
  },
  {
    pattern: "/admin/api-usage",
    labelKey: "layout.nav.apiUsage",
    ns: "admin",
    href: "/admin/api-usage",
    parent: "/admin",
  },
  {
    pattern: "/admin/content",
    labelKey: "layout.nav.content",
    ns: "admin",
    href: "/admin/content",
    parent: "/admin",
  },
  {
    pattern: "/admin/faq",
    labelKey: "layout.nav.faq",
    ns: "admin",
    href: "/admin/faq",
    parent: "/admin",
  },
  { pattern: "/admin", labelKey: "layout.title", ns: "admin", href: "/admin/dashboard" },

  // App detail / nested
  {
    pattern: "/rules/:ruleId/news-trigger",
    labelKey: "breadcrumb.newsTrigger",
    parent: "/rules",
    href: "/rules/:ruleId/news-trigger",
  },
  {
    pattern: "/workflow/:ruleId",
    labelKey: "breadcrumb.detail",
    parent: "/workflows",
    dynamic: true,
    href: "/workflow/:ruleId",
  },
  {
    pattern: "/upload/:uploadId",
    labelKey: "breadcrumb.review",
    parent: "/content",
    dynamic: true,
    href: "/upload/:uploadId",
  },
  {
    pattern: "/content/:contentId",
    labelKey: "breadcrumb.detail",
    parent: "/content",
    dynamic: true,
    href: "/content/:contentId",
  },
  {
    pattern: "/contents/:contentId",
    labelKey: "breadcrumb.detail",
    parent: "/content",
    dynamic: true,
    href: "/contents/:contentId",
  },
  {
    pattern: "/posts/:postId",
    labelKey: "breadcrumb.detail",
    parent: "/posts",
    dynamic: true,
    href: "/posts/:postId",
  },

  // App list
  { pattern: "/dashboard", labelKey: "nav.dashboard", href: "/dashboard" },
  { pattern: "/rules", labelKey: "nav.rules", href: "/rules" },
  { pattern: "/workflows", labelKey: "nav.workflows", href: "/workflows" },
  { pattern: "/pipelines", labelKey: "nav.pipelines", href: "/pipelines" },
  { pattern: "/content", labelKey: "nav.content", href: "/content" },
  { pattern: "/upload", labelKey: "routes.upload", href: "/upload" },
  { pattern: "/posts", labelKey: "nav.posts", href: "/posts" },
  { pattern: "/settings/accounts", labelKey: "nav.settingsAccounts", href: "/settings/accounts" },
  { pattern: "/usage", labelKey: "nav.usage", href: "/usage" },

  // Auth
  { pattern: "/login", labelKey: "signIn.title", ns: "auth", href: "/login", parent: "/" },
  { pattern: "/signup", labelKey: "signUp.title", ns: "auth", href: "/signup", parent: "/" },
  {
    pattern: "/forgot-password",
    labelKey: "forgotPassword.title",
    ns: "auth",
    href: "/forgot-password",
    parent: "/",
  },
  {
    pattern: "/verify-otp",
    labelKey: "verifyOtp.title",
    ns: "auth",
    href: "/verify-otp",
    parent: "/",
  },
  {
    pattern: "/reset-password",
    labelKey: "resetPassword.title",
    ns: "auth",
    href: "/reset-password",
    parent: "/",
  },

  // Marketing home
  { pattern: "/home", labelKey: "nav.home", href: "/home" },
  { pattern: "/", labelKey: "nav.home", href: "/" },
]

type PatternMatch = {
  def: RouteBreadcrumbDef
  params: Record<string, string>
}

function patternToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\\:([A-Za-z0-9_]+)/g, "([^/]+)")
  return new RegExp(`^${escaped}$`)
}

export function matchRouteBreadcrumb(pathname: string): PatternMatch | undefined {
  for (const def of ROUTE_BREADCRUMB_DEFS) {
    const regex = patternToRegex(def.pattern)
    const match = pathname.match(regex)
    if (!match) continue

    const paramNames = [...def.pattern.matchAll(/:([A-Za-z0-9_]+)/g)].map((m) => m[1])
    const params: Record<string, string> = {}
    paramNames.forEach((name, index) => {
      params[name] = decodeURIComponent(match[index + 1] ?? "")
    })

    return { def, params }
  }
  return undefined
}

function resolveHref(template: string | undefined, params: Record<string, string>): string | undefined {
  if (!template) return undefined
  return template.replace(/:([A-Za-z0-9_]+)/g, (_, key: string) => params[key] ?? "")
}

function buildChain(
  match: PatternMatch,
  defsByPattern: Map<string, RouteBreadcrumbDef>,
  t: (ns: string, key: string) => string,
  overrideLabel?: string,
): BreadcrumbItem[] {
  const chain: { def: RouteBreadcrumbDef; params: Record<string, string> }[] = []
  let current: PatternMatch | undefined = match

  while (current) {
    chain.unshift(current)
    const parentPattern = current.def.parent
    if (!parentPattern) break
    const parentDef = defsByPattern.get(parentPattern)
    if (!parentDef) break
    current = { def: parentDef, params: current.params }
  }

  return chain.map(({ def, params }, index) => {
    const ns = def.ns ?? "common"
    const isLast = index === chain.length - 1
    let label = t(ns, def.labelKey)

    if (isLast && def.dynamic && overrideLabel) {
      label = overrideLabel
    } else if (isLast && def.dynamic && !overrideLabel) {
      label = t("common", "breadcrumb.detail")
    }

    const href = !isLast ? resolveHref(def.href, params) : undefined
    return { label, href }
  })
}

export function resolvePageBreadcrumbs(
  pathname: string,
  t: (ns: string, key: string) => string,
  overrideLabel?: string,
): BreadcrumbItem[] {
  const matched = matchRouteBreadcrumb(pathname)
  if (!matched) return []

  const defsByPattern = new Map(ROUTE_BREADCRUMB_DEFS.map((d) => [d.pattern, d]))
  return buildChain(matched, defsByPattern, t, overrideLabel)
}
