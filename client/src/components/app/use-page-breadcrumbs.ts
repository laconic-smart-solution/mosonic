import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { useLocation } from "react-router-dom"

import { useBreadcrumbOverride } from "@/components/app/breadcrumb-override.context"
import { resolvePageBreadcrumbs, type BreadcrumbItem } from "@/lib/route-breadcrumbs"

export function usePageBreadcrumbs(override?: BreadcrumbItem[]): BreadcrumbItem[] {
  const { pathname } = useLocation()
  const overrideCtx = useBreadcrumbOverride()
  const { t, i18n } = useTranslation(["common", "admin", "auth"])

  return useMemo(() => {
    if (override) return override

    const translate = (ns: string, key: string) => {
      if (ns === "common") return t(key, { ns: "common" })
      if (ns === "admin") return t(key, { ns: "admin" })
      if (ns === "auth") return t(key, { ns: "auth" })
      return t(key)
    }

    return resolvePageBreadcrumbs(pathname, translate, overrideCtx?.label)
  }, [override, pathname, t, i18n.language, overrideCtx?.label])
}
