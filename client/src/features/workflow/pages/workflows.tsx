import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useLocation, useNavigate } from "react-router-dom"
import { AnimatePresence, motion } from "framer-motion"
import { format } from "date-fns"
import {
  ChevronRight,
  CircleAlert,
  GitBranch,
  Inbox,
  Search,
} from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { PersistedShadcnPagination } from "@/components/core/persisted-shadcn-pagination"
import { cn } from "@/lib/utils"
import {
  navigateSearchParams,
  readListPagination,
  setListLimitInParams,
  setListPageInParams,
  type ListPaginationDefaults,
} from "@/lib/list-pagination-url"
import { useAuthStoreHydrated } from "@/shared/hooks/use-auth-store-hydrated"
import { useWorkflowsPageQuery } from "@/shared/queries/workflow.query"
import type {
  WorkflowNodeType,
  WorkflowPageItem,
} from "@/shared/types/workflow.type"

const SEARCH_DEBOUNCE_MS = 300
const PAGE_LIMITS = [9, 18, 27] as const

const WORKFLOW_PAGINATION_DEFAULTS: ListPaginationDefaults = {
  defaultPage: 1,
  defaultLimit: 9,
  allowedLimits: PAGE_LIMITS,
}

const NODE_TYPE_FILTER_VALUES: WorkflowNodeType[] = [
  "keyword_planner",
  "text_generation",
  "image_generation",
  "video_generation",
  "translation",
  "summarization",
]

function statusBadgeClass(status: string): string {
  switch (status) {
    case "ready":
      return "border-emerald-200 bg-emerald-50 text-emerald-800"
    case "failed":
      return "border-red-200 bg-red-50 text-red-800"
    case "archived":
      return "border-border bg-muted text-muted-foreground"
    default:
      return "border-amber-200 bg-amber-50 text-amber-900"
  }
}

export default function WorkflowsPage() {
  const { t } = useTranslation(["workflow", "common"])
  const navigate = useNavigate()
  const location = useLocation()
  const locationRef = useRef(location)
  locationRef.current = location
  const hydrated = useAuthStoreHydrated()

  const { page, limit } = useMemo(
    () =>
      readListPagination(
        new URLSearchParams(location.search),
        WORKFLOW_PAGINATION_DEFAULTS
      ),
    [location.search]
  )

  const goToPage = useCallback(
    (next: number) => {
      navigateSearchParams(navigate, locationRef.current, (params) => {
        setListPageInParams(params, next, WORKFLOW_PAGINATION_DEFAULTS)
      })
    },
    [navigate]
  )

  const resetToFirstPage = useCallback(() => {
    navigateSearchParams(navigate, locationRef.current, (params) => {
      setListPageInParams(params, 1, WORKFLOW_PAGINATION_DEFAULTS)
    })
  }, [navigate])

  const setLimitFromUrl = useCallback(
    (n: (typeof PAGE_LIMITS)[number]) => {
      navigateSearchParams(navigate, locationRef.current, (params) => {
        setListLimitInParams(params, n, WORKFLOW_PAGINATION_DEFAULTS)
      })
    },
    [navigate]
  )
  const [searchInput, setSearchInput] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [nodeType, setNodeType] = useState<WorkflowNodeType | "all">("all")

  useEffect(() => {
    const id = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim())
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(id)
  }, [searchInput])

  const filterPageResetSkip = useRef(true)
  useEffect(() => {
    if (filterPageResetSkip.current) {
      filterPageResetSkip.current = false
      return
    }
    resetToFirstPage()
  }, [debouncedSearch, nodeType, resetToFirstPage])

  const payload = useMemo(() => {
    const filter: { q?: string; nodeType?: WorkflowNodeType } = {
      ...(debouncedSearch ? { q: debouncedSearch } : {}),
      ...(nodeType !== "all" ? { nodeType } : {}),
    }
    return {
      page,
      limit,
      sortBy: "updatedAt" as const,
      sortOrder: "desc" as const,
      ...(Object.keys(filter).length ? { filter } : {}),
    }
  }, [page, limit, debouncedSearch, nodeType])

  const { data, isPending, isError, error, refetch } = useWorkflowsPageQuery(
    payload,
    hydrated
  )

  const items = data?.data ?? []
  const meta = data?.meta
  const totalPages = meta?.totalPages ?? 0

  useEffect(() => {
    if (!meta?.totalPages) return
    if (page > meta.totalPages) {
      goToPage(meta.totalPages)
    }
  }, [meta?.totalPages, page, goToPage, meta])

  const empty =
    !isPending &&
    !isError &&
    hydrated &&
    items.length === 0 &&
    (meta?.total ?? 0) === 0

  const errorMessage =
    error instanceof Error ? error.message : t("errors.loadWorkflowsFailed")

  function nodeTypeLabel(type: string): string {
    return t(`nodeTypesBackend.${type}` as "nodeTypesBackend.keyword_planner", {
      defaultValue: type.replace(/_/g, " "),
    })
  }

  function openWorkflow(row: WorkflowPageItem) {
    navigate(`/workflow/${encodeURIComponent(row.ruleRef)}`)
  }

  return (
    <div className="mx-auto w-full px-4 py-8 sm:px-6">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-muted-foreground">
            <GitBranch className="size-5 shrink-0" aria-hidden />
            <span className="text-xs font-semibold tracking-wide uppercase">
              {t("workflowsList.library")}
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {t("workflowsList.title")}
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            {t("workflowsList.subtitle")}
          </p>
        </div>
      </div>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="relative min-w-0 flex-1 sm:max-w-md">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t("workflowsList.searchPlaceholder")}
            className="h-10 rounded-lg border-border bg-card pr-3 pl-9"
            aria-label={t("workflowsList.searchAria")}
          />
        </div>
        <Select
          value={nodeType}
          onValueChange={(v) => setNodeType(v as WorkflowNodeType | "all")}
        >
          <SelectTrigger className="h-10 w-full rounded-lg border-border bg-card sm:w-[220px]">
            <SelectValue placeholder={t("workflowsList.nodeTypePlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("workflowsList.allNodeTypes")}</SelectItem>
            {NODE_TYPE_FILTER_VALUES.map((value) => (
              <SelectItem key={value} value={value}>
                {nodeTypeLabel(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={String(limit)}
          onValueChange={(v) => {
            setLimitFromUrl(Number(v) as (typeof PAGE_LIMITS)[number])
          }}
        >
          <SelectTrigger className="h-10 w-full rounded-lg border-border bg-card sm:w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_LIMITS.map((n) => (
              <SelectItem key={n} value={String(n)}>
                {t("workflowsList.perPage", { count: n })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isError ? (
        <Alert variant="destructive" className="mb-6">
          <CircleAlert className="size-4" />
          <AlertTitle>{t("workflowsList.loadErrorTitle")}</AlertTitle>
          <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>{errorMessage}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
            >
              {t("common:actions.retry")}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {empty ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed border-border bg-muted/20 py-16 text-center">
          <Inbox
            className="mb-3 size-11 text-muted-foreground/60"
            aria-hidden
          />
          <p className="text-sm font-medium text-foreground">
            {t("workflowsList.emptyTitle")}
          </p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            {debouncedSearch || nodeType !== "all"
              ? t("workflowsList.emptyFiltered")
              : t("workflowsList.emptyDefault")}
          </p>
        </div>
      ) : null}

      {(isPending || (!empty && !isError && items.length > 0)) && !isError ? (
        <div
          className={cn(
            "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3",
            empty && "hidden"
          )}
        >
          {isPending ? (
            Array.from({ length: Math.min(limit, 9) }).map((_, i) => (
              <div
                key={i}
                className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm"
              >
                <Skeleton className="h-24 rounded-none bg-muted" />
                <div className="space-y-3 p-4">
                  <Skeleton className="h-5 w-[80%] bg-muted" />
                  <div className="flex gap-1">
                    <Skeleton className="h-5 w-16 rounded-full bg-muted" />
                    <Skeleton className="h-5 w-20 rounded-full bg-muted" />
                  </div>
                  <Skeleton className="h-3 w-28 bg-muted" />
                </div>
              </div>
            ))
          ) : (
            <AnimatePresence initial={false} mode="popLayout">
              {items.map((row) => (
                <motion.button
                  key={row.workflowId}
                  type="button"
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                  onClick={() => openWorkflow(row)}
                  className={cn(
                    "group flex h-full flex-col rounded-xl border border-border bg-card p-4 text-left shadow-sm",
                    "transition-colors hover:border-primary/30 hover:bg-muted/30"
                  )}
                >
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <h2 className="line-clamp-2 min-h-10 flex-1 text-[15px] leading-snug font-semibold text-foreground">
                      {row.name}
                    </h2>
                    <Badge
                      variant="outline"
                      className={cn(
                        "shrink-0 text-[10px] font-normal capitalize",
                        statusBadgeClass(row.status)
                      )}
                    >
                      {row.status}
                    </Badge>
                  </div>
                  <div className="mb-3 flex min-h-[28px] flex-wrap gap-1.5">
                    {(row.nodeTypes.length ? row.nodeTypes : ["—"]).map(
                      (nodeTypeKey, i) => (
                        <Badge
                          key={`${row.workflowId}-${nodeTypeKey}-${i}`}
                          variant="secondary"
                          className="text-[10px] font-normal"
                        >
                          {nodeTypeKey === "—"
                            ? t("workflowsList.noNodesYet")
                            : nodeTypeLabel(nodeTypeKey)}
                        </Badge>
                      )
                    )}
                  </div>
                  <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/60 pt-3">
                    <span className="text-[11px] text-muted-foreground">
                      {t("workflowsList.updated", {
                        date: format(new Date(row.updatedAt), "MMM d, yyyy"),
                      })}
                    </span>
                    <ChevronRight
                      className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </div>
                </motion.button>
              ))}
            </AnimatePresence>
          )}
        </div>
      ) : null}

      {!isPending && !isError && meta != null && (meta.total ?? 0) > 0 ? (
        <p className="mt-4 text-center text-[13px] text-muted-foreground">
          {t("workflowsList.showing", {
            count: items.length,
            total: meta.total ?? 0,
          })}
        </p>
      ) : null}

      {!isPending && !isError && meta && totalPages > 1 ? (
        <div className="mt-8 flex flex-col items-center gap-4 border-t border-border pt-6 sm:flex-row sm:justify-between">
          <p className="text-[13px] text-muted-foreground">
            {t("workflowsList.pageOf", {
              page: meta.page,
              totalPages: meta.totalPages,
            })}
          </p>
          <PersistedShadcnPagination
            page={page}
            totalPages={totalPages}
            onPageChange={goToPage}
            className="mx-0 w-full justify-center sm:w-auto sm:justify-end"
          />
        </div>
      ) : null}
    </div>
  )
}
