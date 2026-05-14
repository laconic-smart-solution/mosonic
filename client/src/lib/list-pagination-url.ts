import type { Location, NavigateFunction } from "react-router-dom"

export type ListPaginationDefaults = {
  defaultPage: number
  defaultLimit: number
  allowedLimits: readonly number[]
}

/** Apply query updates using the current location (avoids stale `useSearchParams` snapshots with RR7). */
export function navigateSearchParams(
  navigate: NavigateFunction,
  location: Pick<Location, "pathname" | "search">,
  updater: (params: URLSearchParams) => void,
  options?: { replace?: boolean },
): void {
  const params = new URLSearchParams(location.search)
  updater(params)
  const qs = params.toString()
  navigate(
    { pathname: location.pathname, search: qs ? `?${qs}` : "" },
    { replace: options?.replace ?? true },
  )
}

export function readListPagination(
  searchParams: URLSearchParams,
  defaults: ListPaginationDefaults,
): { page: number; limit: number } {
  const pageRaw = searchParams.get("page")
  let page = pageRaw ? Number.parseInt(pageRaw, 10) : defaults.defaultPage
  if (!Number.isFinite(page) || page < 1) page = defaults.defaultPage

  const limitRaw = searchParams.get("limit")
  let limit = limitRaw ? Number.parseInt(limitRaw, 10) : defaults.defaultLimit
  if (!Number.isFinite(limit) || !defaults.allowedLimits.includes(limit as never)) {
    limit = defaults.defaultLimit
  }

  return { page, limit }
}

/** Set page in query; omits param when equal to default (usually 1). Mutates `params`. */
export function setListPageInParams(
  params: URLSearchParams,
  page: number,
  defaults: ListPaginationDefaults,
): URLSearchParams {
  if (page <= defaults.defaultPage) params.delete("page")
  else params.set("page", String(page))
  return params
}

/** Set limit and reset page to default (first page). Mutates `params`. */
export function setListLimitInParams(
  params: URLSearchParams,
  limit: number,
  defaults: ListPaginationDefaults,
): URLSearchParams {
  const safe = defaults.allowedLimits.includes(limit as never)
    ? limit
    : defaults.defaultLimit
  if (safe === defaults.defaultLimit) params.delete("limit")
  else params.set("limit", String(safe))
  params.delete("page")
  return params
}

export function getPaginationItems(
  current: number,
  total: number,
): Array<number | "ellipsis"> {
  if (total <= 1) return [1]
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }
  if (current <= 4) {
    return [1, 2, 3, 4, 5, "ellipsis", total]
  }
  if (current >= total - 3) {
    return [1, "ellipsis", total - 4, total - 3, total - 2, total - 1, total]
  }
  return [1, "ellipsis", current - 1, current, current + 1, "ellipsis", total]
}
