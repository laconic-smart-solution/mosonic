import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { useLocation, useNavigate } from "react-router-dom"
import { AnimatePresence, motion } from "framer-motion"
import { CircleAlert, Inbox, LayoutGrid } from "lucide-react"

import { PersistedShadcnPagination } from "@/components/core/persisted-shadcn-pagination"
import { PageShell } from "@/components/app/page-shell"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { PipelineListCard } from "@/features/pipeline/components/pipeline-list-card"
import { PipelineStopConfirmDialog } from "@/features/pipeline/components/pipeline-stop-confirm-dialog"
import { PipelinesToolbar } from "@/features/pipeline/components/pipelines-toolbar"
import {
  PIPELINE_PAGINATION_DEFAULTS,
  pipelineSortToQuery,
} from "@/features/pipeline/lib/pipeline-list-format"
import { parsePipelineFilters } from "@/features/pipeline/lib/pipelines-filter-config"
import {
  PIPELINE_ALL_TILE_THEME,
  PIPELINE_STAT_TILES,
  PIPELINE_STATUS_THEME,
} from "@/features/pipeline/lib/pipeline-status-theme"
import { navigateAfterPipelineSuccess } from "@/features/workflow/lib/pipeline-completion-nav"
import {
  navigateSearchParams,
  readListPagination,
  setListLimitInParams,
  setListPageInParams,
} from "@/lib/list-pagination-url"
import { cn } from "@/lib/utils"
import { useAuthStoreHydrated } from "@/shared/hooks/use-auth-store-hydrated"
import {
  usePipelinePageQuery,
  usePipelineStatsQuery,
} from "@/shared/queries/pipeline.query"
import {
  useGetWorkflowQuery,
  useWorkflowsPageQuery,
} from "@/shared/queries/workflow.query"
import type { PipelinePageItem, PipelineStatus } from "@/shared/types/pipeline.type"

const gridVariants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.055 },
  },
}

const cardVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 },
}

export default function PipelinesPage() {
  const { t } = useTranslation("pipeline")
  const { t: tc } = useTranslation("common")
  const navigate = useNavigate()
  const location = useLocation()
  const locationRef = useRef(location)
  locationRef.current = location
  const hydrated = useAuthStoreHydrated()
  const [stopPipelineId, setStopPipelineId] = useState<string | undefined>()

  const filters = useMemo(
    () => parsePipelineFilters(location.search),
    [location.search],
  )

  const { page, limit } = useMemo(
    () =>
      readListPagination(
        new URLSearchParams(location.search),
        PIPELINE_PAGINATION_DEFAULTS,
      ),
    [location.search],
  )

  const filterKey = `${filters.status}|${filters.workflowId}|${filters.sort}|${page}|${limit}`

  const goToPage = useCallback(
    (next: number) => {
      navigateSearchParams(navigate, locationRef.current, (params) => {
        setListPageInParams(params, next, PIPELINE_PAGINATION_DEFAULTS)
      })
    },
    [navigate],
  )

  const setLimitFromUrl = useCallback(
    (n: (typeof PIPELINE_PAGINATION_DEFAULTS.allowedLimits)[number]) => {
      navigateSearchParams(navigate, locationRef.current, (params) => {
        setListLimitInParams(params, n, PIPELINE_PAGINATION_DEFAULTS)
      })
    },
    [navigate],
  )

  const setStatusTile = useCallback(
    (next: PipelineStatus | "all") => {
      navigateSearchParams(navigate, locationRef.current, (params) => {
        if (next === "all") params.delete("status")
        else params.set("status", next)
        params.delete("page")
      })
    },
    [navigate],
  )

  const setWorkflowFilter = useCallback(
    (id: string | null) => {
      navigateSearchParams(navigate, locationRef.current, (params) => {
        if (!id) params.delete("workflow")
        else params.set("workflow", id)
        params.delete("page")
      })
    },
    [navigate],
  )

  const setSortFilter = useCallback(
    (next: typeof filters.sort) => {
      navigateSearchParams(navigate, locationRef.current, (params) => {
        if (next === "started_desc") params.delete("sort")
        else params.set("sort", next)
        params.delete("page")
      })
    },
    [navigate],
  )

  const clearToolbar = useCallback(() => {
    navigateSearchParams(navigate, locationRef.current, (params) => {
      params.delete("status")
      params.delete("workflow")
      params.delete("sort")
      setListPageInParams(
        params,
        PIPELINE_PAGINATION_DEFAULTS.defaultPage,
        PIPELINE_PAGINATION_DEFAULTS,
      )
    })
  }, [navigate])

  const { sortBy, sortOrder } = useMemo(
    () => pipelineSortToQuery(filters.sort),
    [filters.sort],
  )

  const payload = useMemo(() => {
    const pageFilter: {
      workflowRef?: string
      status?: PipelineStatus
    } = {}
    if (filters.workflowId) pageFilter.workflowRef = filters.workflowId
    if (filters.status !== "all") pageFilter.status = filters.status
    return {
      page,
      limit,
      ...(Object.keys(pageFilter).length > 0 ? { filter: pageFilter } : {}),
      sortBy,
      sortOrder,
    }
  }, [page, limit, filters.workflowId, filters.status, sortBy, sortOrder])

  const listQuery = usePipelinePageQuery(payload, hydrated)
  const statsQuery = usePipelineStatsQuery(filters.workflowId ?? undefined, hydrated)

  const workflowsQuery = useWorkflowsPageQuery(
    { page: 1, limit: 100, sortBy: "updatedAt", sortOrder: "desc" },
    hydrated,
  )

  const selectedWorkflowId = filters.workflowId
  const selectedMissingFromList =
    !!selectedWorkflowId &&
    !(workflowsQuery.data?.data ?? []).some(
      (row) => row.workflowId === selectedWorkflowId,
    )
  const selectedWorkflowQuery = useGetWorkflowQuery(
    selectedMissingFromList ? selectedWorkflowId : undefined,
  )

  const workflowOptions = useMemo(() => {
    const opts = (workflowsQuery.data?.data ?? []).map((row) => ({
      workflowId: row.workflowId,
      name: row.name,
    }))
    const selectedName = selectedWorkflowQuery.data?.workflow?.name?.trim()
    if (
      selectedWorkflowId &&
      selectedName &&
      !opts.some((o) => o.workflowId === selectedWorkflowId)
    ) {
      opts.unshift({ workflowId: selectedWorkflowId, name: selectedName })
    }
    return opts
  }, [
    workflowsQuery.data?.data,
    selectedWorkflowId,
    selectedWorkflowQuery.data?.workflow?.name,
  ])

  useEffect(() => {
    const tp = listQuery.data?.meta.totalPages ?? 0
    if (tp <= 0) return
    if (page > tp) goToPage(tp)
  }, [listQuery.data?.meta.totalPages, page, goToPage])

  const items = listQuery.data?.data ?? []
  const meta = listQuery.data?.meta
  const totalPages = meta?.totalPages ?? 0
  const listTotal = meta?.total ?? 0
  const rangeStart = listTotal === 0 ? 0 : (page - 1) * limit + 1
  const rangeEnd = Math.min(page * limit, listTotal)

  const queryReady = hydrated
  const listLoading = Boolean(listQuery.isPending && queryReady)
  const showPaginationFooter =
    queryReady && !listQuery.isError && !listLoading && listTotal > 0

  const errorMessage =
    listQuery.error instanceof Error
      ? listQuery.error.message
      : t("errors.loadFailed")

  const openPipeline = useCallback(
    async (item: PipelinePageItem) => {
      if (item.status === "completed") {
        await navigateAfterPipelineSuccess(navigate, {
          pipelineId: item.pipelineId,
        })
        return
      }
      const path = `/workflow/${encodeURIComponent(item.ruleRef)}`
      if (item.status === "running") {
        navigate(
          `${path}?pipelineId=${encodeURIComponent(item.pipelineId)}`,
        )
        return
      }
      navigate(path)
    },
    [navigate],
  )

  function statCount(tile: (typeof PIPELINE_STAT_TILES)[number]): number {
    const data = statsQuery.data
    if (!data || statsQuery.isError) return 0
    if (tile.key === "all") return data.total
    if (!tile.status) return 0
    return data.byStatus[tile.status] ?? 0
  }

  return (
    <PageShell>
      <PipelineStopConfirmDialog
        pipelineId={stopPipelineId}
        open={!!stopPipelineId}
        onOpenChange={(open) => {
          if (!open) setStopPipelineId(undefined)
        }}
        onStopped={(result) => {
          setStopPipelineId(undefined)
          toast.success(
            result?.keptProgress
              ? t("page.toastStoppedKeptProgress")
              : t("page.toastStopped"),
          )
          void listQuery.refetch()
          void statsQuery.refetch()
        }}
        onError={(message) => toast.error(message)}
      />
      <motion.div className="flex w-full flex-col gap-5">
        <header className="space-y-1">
          <div className="mb-1 flex items-center gap-2 text-muted-foreground">
            <LayoutGrid className="size-5 shrink-0" aria-hidden />
            <span className="text-xs font-semibold tracking-wide uppercase">
              {t("page.sectionLabel")}
            </span>
          </div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
            {t("page.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("page.description")}
          </p>
        </header>

        <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {PIPELINE_STAT_TILES.map((tile) => {
            const active =
              tile.key === "all"
                ? filters.status === "all"
                : filters.status === tile.status
            const countDisplay = statsQuery.isPending
              ? "…"
              : statsQuery.isError
                ? "—"
                : statCount(tile)
            const theme =
              tile.key === "all"
                ? PIPELINE_ALL_TILE_THEME
                : PIPELINE_STATUS_THEME[tile.status!]
            return (
              <button
                key={tile.key}
                type="button"
                onClick={() =>
                  setStatusTile(tile.key === "all" ? "all" : tile.status!)
                }
                className={cn(
                  "flex min-h-[72px] min-w-0 flex-col justify-center rounded-xl border px-3 py-2 text-left transition-colors",
                  active ? theme.tileActive : theme.tileIdle,
                )}
              >
                <span
                  className={cn(
                    "text-[11px] font-medium tracking-wide uppercase",
                    active ? theme.tileLabelActive : "text-muted-foreground",
                  )}
                >
                  {t(`status.${tile.key}`)}
                </span>
                <span
                  className={cn(
                    "text-xl font-semibold tabular-nums",
                    active ? theme.tileCountActive : "text-foreground",
                    tile.status === "running" && !active && "animate-pulse",
                  )}
                >
                  {countDisplay}
                </span>
              </button>
            )
          })}
        </div>

        {statsQuery.isError ? (
          <Alert variant="destructive" className="py-3">
            <AlertTitle className="text-sm">{t("page.statsUnavailableTitle")}</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center gap-2 text-xs">
              <span className="min-w-0 flex-1">
                {t("page.statsUnavailableDescription")}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="shrink-0 border-current/40 bg-background"
                onClick={() => void statsQuery.refetch()}
              >
                {t("page.retryStats")}
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        <PipelinesToolbar
          workflowId={filters.workflowId}
          workflowOptions={workflowOptions}
          onWorkflowChange={setWorkflowFilter}
          sort={filters.sort}
          onSortChange={setSortFilter}
          limit={limit}
          onLimitChange={setLimitFromUrl}
          onClear={clearToolbar}
        />

        {!queryReady ? (
          <motion.div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <motion.div
                key={i}
                className="flex min-h-[220px] flex-col rounded-2xl border border-[color:var(--nt-border)] bg-[color:var(--nt-surface)] p-4"
              >
                <Skeleton className="mb-3 h-8 w-8 rounded-lg bg-muted" />
                <Skeleton className="mb-3 h-5 w-[85%] bg-muted" />
                <div className="mb-3 flex gap-1.5">
                  <Skeleton className="h-6 w-16 rounded-md bg-muted" />
                  <Skeleton className="h-6 w-14 rounded-md bg-muted" />
                </div>
                <Skeleton className="mt-auto h-3 w-32 bg-muted" />
              </motion.div>
            ))}
          </motion.div>
        ) : listQuery.isError ? (
          <Alert variant="destructive">
            <CircleAlert className="size-4" />
            <AlertTitle>{t("page.loadErrorTitle")}</AlertTitle>
            <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span>{errorMessage}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void listQuery.refetch()}
              >
                {tc("actions.retry")}
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <motion.div
              className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--nt-border)] pb-3"
              initial={false}
            >
              <p className="text-[13px] text-muted-foreground">
                {listLoading ? (
                  <>{t("page.loadingMatches")}</>
                ) : listTotal === 0 ? (
                  <>{t("page.noMatches")}</>
                ) : listTotal === 1 ? (
                  <>{t("page.oneMatch")}</>
                ) : (
                  <>{t("page.manyMatches", { count: listTotal })}</>
                )}
              </p>
              {!listLoading && listTotal > 0 ? (
                <p className="text-[12px] tabular-nums text-muted-foreground">
                  {t("page.showingRange", { start: rangeStart, end: rangeEnd })}
                </p>
              ) : null}
            </motion.div>

            {listLoading ? (
              <motion.div className="grid grid-cols-1 gap-4 py-2 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: Math.min(limit, 6) }).map((_, i) => (
                  <div
                    key={i}
                    className="flex min-h-[220px] flex-col rounded-2xl border border-[color:var(--nt-border)] bg-[color:var(--nt-surface)] p-4"
                  >
                    <Skeleton className="mb-3 h-8 w-8 rounded-lg bg-muted" />
                    <Skeleton className="mb-3 h-5 w-[85%] bg-muted" />
                    <div className="mb-3 flex gap-1.5">
                      <Skeleton className="h-6 w-16 rounded-md bg-muted" />
                      <Skeleton className="h-6 w-14 rounded-md bg-muted" />
                    </div>
                    <Skeleton className="mt-auto h-3 w-28 bg-muted" />
                  </div>
                ))}
              </motion.div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center rounded-xl border border-dashed border-[color:var(--nt-border)] bg-[color:var(--nt-surface)]/60 py-16 text-center">
                <Inbox
                  className="mb-3 size-11 text-muted-foreground/60"
                  aria-hidden
                />
                <p className="text-sm font-medium text-foreground">
                  {t("page.emptyTitle")}
                </p>
                <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                  {t("page.emptyDescription")}
                </p>
              </div>
            ) : (
              <motion.div
                key={filterKey}
                className="grid grid-cols-1 gap-4 py-2 sm:grid-cols-2 xl:grid-cols-3"
                variants={gridVariants}
                initial="hidden"
                animate="show"
              >
                <AnimatePresence initial={false} mode="popLayout">
                  {items.map((item, index) => (
                    <motion.div
                      key={item.pipelineId}
                      layout
                      variants={cardVariants}
                      transition={{ duration: 0.22 }}
                      className="min-h-[190px]"
                    >
                      <PipelineListCard
                        item={item}
                        index={index}
                        onOpen={openPipeline}
                        onStop={(row) => setStopPipelineId(row.pipelineId)}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </motion.div>
            )}

            {showPaginationFooter && totalPages > 1 ? (
              <motion.div
                className="flex flex-col items-center gap-3 border-t border-[color:var(--nt-border)] pt-5 sm:flex-row sm:justify-between"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
              >
                <p className="text-sm text-muted-foreground">
                  {t("page.pageOf", {
                    page: meta?.page ?? page,
                    total: totalPages,
                  })}
                </p>
                <PersistedShadcnPagination
                  page={page}
                  totalPages={totalPages}
                  onPageChange={goToPage}
                />
              </motion.div>
            ) : null}
          </>
        )}
      </motion.div>
    </PageShell>
  )
}
