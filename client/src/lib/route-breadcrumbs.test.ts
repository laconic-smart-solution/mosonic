import { describe, expect, it } from "vitest"

import { matchRouteBreadcrumb, resolvePageBreadcrumbs } from "./route-breadcrumbs"

const t = (ns: string, key: string) => `${ns}:${key}`

describe("matchRouteBreadcrumb", () => {
  it("matches static routes", () => {
    const match = matchRouteBreadcrumb("/pipelines")
    expect(match?.def.pattern).toBe("/pipelines")
  })

  it("matches dynamic routes with params", () => {
    const match = matchRouteBreadcrumb("/posts/abc-123")
    expect(match?.def.pattern).toBe("/posts/:postId")
    expect(match?.params.postId).toBe("abc-123")
  })

  it("prefers more specific patterns", () => {
    const match = matchRouteBreadcrumb("/admin/users/user-1")
    expect(match?.def.pattern).toBe("/admin/users/:userId")
  })

  it("matches nested admin content detail", () => {
    const match = matchRouteBreadcrumb("/admin/content/c-99")
    expect(match?.def.pattern).toBe("/admin/content/:contentId")
    expect(match?.params.contentId).toBe("c-99")
  })
})

describe("resolvePageBreadcrumbs", () => {
  it("builds parent chain for post detail", () => {
    const crumbs = resolvePageBreadcrumbs("/posts/post-1", t, "My Post")
    expect(crumbs.map((c) => c.label)).toEqual(["common:nav.posts", "My Post"])
    expect(crumbs[0]?.href).toBe("/posts")
    expect(crumbs[1]?.href).toBeUndefined()
  })

  it("builds admin chain", () => {
    const crumbs = resolvePageBreadcrumbs("/admin/users/u-1", t, "Jane")
    expect(crumbs.map((c) => c.label)).toEqual([
      "admin:layout.title",
      "admin:layout.nav.users",
      "Jane",
    ])
  })

  it("builds auth chain with home parent", () => {
    const crumbs = resolvePageBreadcrumbs("/login", t)
    expect(crumbs.map((c) => c.label)).toEqual(["common:nav.home", "auth:signIn.title"])
    expect(crumbs[0]?.href).toBe("/")
  })
})
