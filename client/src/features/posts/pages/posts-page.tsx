import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { AnimatePresence, motion } from "framer-motion"
import { toastApiError } from "@/shared/lib/toast-error"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { LayoutGrid } from "lucide-react"

import { PersistedShadcnPagination } from "@/components/core/persisted-shadcn-pagination"
import { PageShell } from "@/components/app/page-shell"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { PostListCard } from "@/features/posts/components/post-list-card"
import { PostsBulkActionsBar } from "@/features/posts/components/posts-bulk-actions-bar"
import { PostsToolbar } from "@/features/posts/components/posts-toolbar"
import {
  ALL_STAT_TILE_THEME,
  POST_STATUS_THEME,
  postStatusLabel,
} from "@/features/posts/lib/post-status-theme"
import {
  CHANNEL_FILTER_ALL,
  DEFAULT_SORT,
  SORT_OPTIONS,
  VALID_CHANNELS,
} from "@/features/posts/lib/posts-filter-config"
import { cn } from "@/lib/utils"
import {
  navigateSearchParams,
  readListPagination,
  setListLimitInParams,
  setListPageInParams,
  type ListPaginationDefaults,
} from "@/lib/list-pagination-url"
import { toastBulkDeleteResult } from "@/features/posts/lib/post-delete-toast"
import {
  useBulkDeletePostsMutation,
  useBulkPublishNowMutation,
  useBulkSchedulePostsMutation,
  usePostsListQuery,
  usePostsStatsQuery,
  useRetryPostMutation,
} from "@/shared/queries/posts.query"
import { useAuthStoreHydrated } from "@/shared/hooks/use-auth-store-hydrated"
import type { PostListSort, PostStatus } from "@/shared/types/post.type"

const POST_LIST_DEFAULTS: ListPaginationDefaults = {
  defaultPage: 1,
  defaultLimit: 20,
  allowedLimits: [10, 20, 50],
}

const STATUSES_ALL: PostStatus[] = [
  "scheduled",
  "published",
  "failed",
  "cancelled",
]

const STAT_TILES: {
  key: PostStatus | "all"
  status?: PostStatus
}[] = [
  { key: "all" },
  { key: "published", status: "published" },
  { key: "scheduled", status: "scheduled" },
  { key: "failed", status: "failed" },
]

const POSTS_GRID_CLASS =
  "grid gap-4 py-5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,18rem),1fr))] justify-items-center sm:gap-5"

function parsePostFilters(search: string): {
  status: PostStatus | "all"
  search: string
  channel: string
  sort: PostListSort
} {
  const p = new URLSearchParams(search)
  const statusRaw = p.get("status")
  const status: PostStatus | "all" =
    statusRaw && STATUSES_ALL.includes(statusRaw as PostStatus)
      ? (statusRaw as PostStatus)
      : "all"

  const searchVal = (p.get("search") ?? "").trim()

  const channelRaw = (p.get("channel") ?? "").trim().toLowerCase()
  const channel =
    channelRaw &&
    channelRaw !== CHANNEL_FILTER_ALL &&
    channelRaw !== "__all__" &&
    VALID_CHANNELS.includes(channelRaw as (typeof VALID_CHANNELS)[number])
      ? channelRaw
      : ""

  const sortRaw = (p.get("sort") ?? "").trim() as PostListSort
  const allowedSorts = SORT_OPTIONS.map((o) => o.value)
  const sort = allowedSorts.includes(sortRaw) ? sortRaw : DEFAULT_SORT

  return { status, search: searchVal, channel, sort }
}

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

export default function PostsPage() {
  const { t } = useTranslation(["posts", "common"])
  const navigate = useNavigate()
  const location = useLocation()
  const locationRef = useRef(location)
  locationRef.current = location
  const hydrated = useAuthStoreHydrated()

  const filters = useMemo(
    () => parsePostFilters(location.search),
    [location.search]
  )

  const { page, limit } = useMemo(
    () =>
      readListPagination(
        new URLSearchParams(location.search),
        POST_LIST_DEFAULTS
      ),
    [location.search]
  )

  const filterKey = `${filters.status}|${filters.search}|${filters.channel}|${filters.sort}|${page}|${limit}`

  const goToPage = useCallback(
    (next: number) => {
      navigateSearchParams(navigate, locationRef.current, (params) => {
        setListPageInParams(params, next, POST_LIST_DEFAULTS)
      })
    },
    [navigate]
  )

  const setLimitFromUrl = useCallback(
    (n: (typeof POST_LIST_DEFAULTS.allowedLimits)[number]) => {
      navigateSearchParams(navigate, locationRef.current, (params) => {
        setListLimitInParams(params, n, POST_LIST_DEFAULTS)
      })
    },
    [navigate]
  )

  const setStatusTile = useCallback(
    (next: PostStatus | "all") => {
      navigateSearchParams(navigate, locationRef.current, (params) => {
        if (next === "all") params.delete("status")
        else params.set("status", next)
        params.delete("page")
      })
    },
    [navigate]
  )

  const setChannelFilter = useCallback(
    (next: string) => {
      navigateSearchParams(navigate, locationRef.current, (params) => {
        const t = next.trim().toLowerCase()
        if (!t || t === "__all__" || t === CHANNEL_FILTER_ALL) {
          params.delete("channel")
        } else params.set("channel", t)
        params.delete("page")
      })
    },
    [navigate]
  )

  const setSortFilter = useCallback(
    (next: PostListSort) => {
      navigateSearchParams(navigate, locationRef.current, (params) => {
        if (next === DEFAULT_SORT) params.delete("sort")
        else params.set("sort", next)
        params.delete("page")
      })
    },
    [navigate]
  )

  const clearToolbar = useCallback(() => {
    navigateSearchParams(navigate, locationRef.current, (params) => {
      params.delete("status")
      params.delete("search")
      params.delete("channel")
      params.delete("sort")
      setListPageInParams(
        params,
        POST_LIST_DEFAULTS.defaultPage,
        POST_LIST_DEFAULTS
      )
    })
    setSearchInput("")
    setSelectedIds(new Set())
  }, [navigate])

  const [bulkScheduleLocal, setBulkScheduleLocal] = useState("")
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())

  const [searchInput, setSearchInput] = useState(filters.search)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setSearchInput(filters.search)
  }, [filters.search])

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    }
  }, [])

  useEffect(() => {
    setSelectedIds(new Set())
  }, [filterKey])

  const listParams = useMemo(
    () => ({
      page,
      limit,
      sort: filters.sort,
      ...(filters.status === "all" ? {} : { status: filters.status }),
      ...(filters.search ? { search: filters.search } : {}),
      ...(filters.channel ? { channel: filters.channel } : {}),
    }),
    [page, limit, filters]
  )

  const listQuery = usePostsListQuery(listParams)
  const statsQuery = usePostsStatsQuery()
  const bulkScheduleMu = useBulkSchedulePostsMutation()
  const bulkPublishMu = useBulkPublishNowMutation()
  const bulkDeleteMu = useBulkDeletePostsMutation()
  const retryMu = useRetryPostMutation()

  useEffect(() => {
    const tp = listQuery.data?.totalPages ?? 0
    if (tp <= 0) return
    if (page > tp) goToPage(tp)
  }, [listQuery.data?.totalPages, page, goToPage])

  const posts = listQuery.data?.posts ?? []
  const totalPages = Math.max(1, listQuery.data?.totalPages ?? 1)
  const listTotal = listQuery.data?.total ?? 0
  const rangeStart = listTotal === 0 ? 0 : (page - 1) * limit + 1
  const rangeEnd = Math.min(page * limit, listTotal)

  const pendingPage = Boolean(listQuery.isPending)

  const allPageSelected =
    posts.length > 0 && posts.every((p) => selectedIds.has(p.postId))

  function toggleSelect(postId: string, next: boolean) {
    setSelectedIds((prev) => {
      const n = new Set(prev)
      if (next) n.add(postId)
      else n.delete(postId)
      return n
    })
  }

  function toggleSelectAllPage(next: boolean) {
    setSelectedIds((prev) => {
      const n = new Set(prev)
      for (const row of posts) {
        if (next) n.add(row.postId)
        else n.delete(row.postId)
      }
      return n
    })
  }

  function openPostDetail(pid: string) {
    navigate(`/posts/${encodeURIComponent(pid)}`)
  }

  function scheduleSearchNavigate(raw: string) {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      navigateSearchParams(navigate, locationRef.current, (params) => {
        const t = raw.trim()
        if (t) params.set("search", t)
        else params.delete("search")
        params.delete("page")
      })
    }, 300)
  }

  function toIsoFromLocal(scheduleLocal: string): string | undefined {
    if (!scheduleLocal.trim()) return undefined
    const d = new Date(scheduleLocal)
    if (Number.isNaN(d.getTime())) return undefined
    return d.toISOString()
  }

  async function handleBulkSchedule() {
    const ids = Array.from(selectedIds)
    if (!ids.length) return
    const scheduledAt = toIsoFromLocal(bulkScheduleLocal)
    if (!scheduledAt) {
      toast.error(t("posts:bulk.scheduleTimeRequired"))
      return
    }
    try {
      const res = await bulkScheduleMu.mutateAsync({
        postIds: ids,
        scheduledAt,
      })
      toast.message(t("posts:bulk.scheduleTitle"), {
        description: t("posts:bulk.scheduleResult", {
          succeeded: res.succeeded,
          failed: res.failed,
        }),
      })
      setBulkScheduleLocal("")
    } catch (e: unknown) {
      toastApiError(e, "posts:bulk.scheduleFailed")
    }
  }

  async function handleBulkPublishNow() {
    const ids = Array.from(selectedIds)
    if (!ids.length) return
    try {
      const res = await bulkPublishMu.mutateAsync({ postIds: ids })
      toast.message(t("posts:bulk.publishNow"), {
        description: t("posts:bulk.publishResult", {
          succeeded: res.succeeded,
          failed: res.failed,
        }),
      })
    } catch (e: unknown) {
      toastApiError(e, "posts:bulk.publishFailed")
    }
  }

  async function handleBulkDelete() {
    const ids = Array.from(selectedIds)
    if (!ids.length) return
    try {
      const res = await bulkDeleteMu.mutateAsync({ postIds: ids })
      toastBulkDeleteResult(res)
      setSelectedIds(new Set())
    } catch (e: unknown) {
      toastApiError(e, "posts:bulk.deleteFailed")
    }
  }

  async function handleRetryOne(postId: string) {
    try {
      const res = await retryMu.mutateAsync(postId)
      toast.success(t("posts:drawer.retrySubmitted"), {
        description: res.newPostId
          ? t("posts:drawer.newLocalPost", {
              id: `${res.newPostId.slice(0, 10)}…`,
            })
          : undefined,
      })
    } catch (e: unknown) {
      toastApiError(e, "posts:bulk.retryFailed")
    }
  }

  function statCount(tile: (typeof STAT_TILES)[number]): number {
    const data = statsQuery.data
    if (!data || statsQuery.isError) return 0
    if (tile.key === "all") return data.total
    if (!tile.status) return 0
    return data.byStatus[tile.status] ?? 0
  }

  const queryReady = hydrated
  const listLoading = pendingPage && queryReady
  const showPaginationFooter =
    queryReady && !listQuery.isError && !listLoading && listTotal > 0

  return (
    <PageShell>
      <motion.div className="flex w-full flex-col gap-5">
        <header className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
            {t("posts:page.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("posts:page.subtitle")}
          </p>
        </header>

        <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4">
          {STAT_TILES.map((tile) => {
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
                ? ALL_STAT_TILE_THEME
                : POST_STATUS_THEME[tile.status!]
            return (
              <button
                key={tile.key}
                type="button"
                onClick={() =>
                  setStatusTile(tile.key === "all" ? "all" : tile.status!)
                }
                className={cn(
                  "flex min-h-[72px] min-w-0 flex-col justify-center rounded-xl border px-3 py-2 text-left transition-colors",
                  active ? theme.tileActive : theme.tileIdle
                )}
              >
                <span
                  className={cn(
                    "text-[11px] font-medium tracking-wide uppercase",
                    active ? theme.tileLabelActive : "text-muted-foreground"
                  )}
                >
                  {postStatusLabel(tile.key === "all" ? "all" : tile.status!)}
                </span>
                <span
                  className={cn(
                    "text-xl font-semibold tabular-nums",
                    active ? theme.tileCountActive : "text-foreground"
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
            <AlertTitle className="text-sm">Post counts unavailable</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center gap-2 text-xs">
              <span className="min-w-0 flex-1">
                The stats request failed — usually the API is outdated or not
                rebuilt. Restart with{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
                  yarn start:dev
                </code>{" "}
                from{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
                  server/
                </code>{" "}
                or run{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
                  {`yarn build && yarn start:prod`}
                </code>
                .
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="shrink-0 border-current/40 bg-background"
                onClick={() => void statsQuery.refetch()}
              >
                Retry stats
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        <PostsToolbar
          searchInput={searchInput}
          onSearchChange={(v) => {
            setSearchInput(v)
            scheduleSearchNavigate(v)
          }}
          channelFilter={filters.channel}
          onChannelChange={setChannelFilter}
          sort={filters.sort}
          onSortChange={setSortFilter}
          limit={limit}
          allowedLimits={POST_LIST_DEFAULTS.allowedLimits}
          onLimitChange={(n) =>
            setLimitFromUrl(
              n as (typeof POST_LIST_DEFAULTS.allowedLimits)[number]
            )
          }
          onClear={clearToolbar}
        />

        <AnimatePresence initial={false}>
          {selectedIds.size > 0 ? (
            <motion.div
              key="bulk"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              <PostsBulkActionsBar
                selectedCount={selectedIds.size}
                scheduleLocal={bulkScheduleLocal}
                onScheduleLocalChange={setBulkScheduleLocal}
                onScheduleConfirm={() => void handleBulkSchedule()}
                onPublishNow={() => void handleBulkPublishNow()}
                onDeleteConfirm={() => void handleBulkDelete()}
                onClearSelection={() => setSelectedIds(new Set())}
                schedulePending={bulkScheduleMu.isPending}
                publishPending={bulkPublishMu.isPending}
                deletePending={bulkDeleteMu.isPending}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>

        {!queryReady ? (
          <div className={POSTS_GRID_CLASS}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex w-full max-w-[22rem] flex-col overflow-hidden rounded-2xl border border-canvas-200"
              >
                <Skeleton className="h-40 w-full rounded-none" />
                <div className="space-y-2 p-3">
                  <Skeleton className="h-7 w-24" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-3/4" />
                </div>
              </div>
            ))}
          </div>
        ) : listQuery.isError ? (
          <Alert variant="destructive">
            <AlertTitle>Could not load posts</AlertTitle>
            <AlertDescription>
              Try adjusting filters or reload the page.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--nt-border)] pb-3">
              <p className="text-[13px] text-muted-foreground">
                {listLoading ? (
                  <>Loading matches…</>
                ) : listTotal === 0 ? (
                  <>No posts match these filters.</>
                ) : listTotal === 1 ? (
                  <>
                    <span className="font-semibold text-foreground">1</span>{" "}
                    post matches
                  </>
                ) : (
                  <>
                    <span className="font-semibold text-foreground">
                      {listTotal.toLocaleString()}
                    </span>{" "}
                    posts match
                  </>
                )}
              </p>
              {!listLoading && posts.length > 0 ? (
                <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                  <Checkbox
                    checked={allPageSelected}
                    onCheckedChange={(v) => toggleSelectAllPage(v === true)}
                    aria-label="Select all posts on page"
                  />
                  Select all on page
                </label>
              ) : null}
            </div>

            <motion.div
              key={filterKey}
              className={POSTS_GRID_CLASS}
              variants={gridVariants}
              initial="hidden"
              animate="show"
            >
              {listLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <motion.div
                      key={i}
                      className="flex w-full max-w-[22rem] flex-col overflow-hidden rounded-2xl border border-canvas-200"
                    >
                      <Skeleton className="h-40 w-full rounded-none" />
                      <div className="space-y-2 p-3">
                        <Skeleton className="h-7 w-24" />
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-3 w-3/4" />
                      </div>
                    </motion.div>
                  ))
                : posts.map((post) => (
                    <motion.div
                      key={post.postId}
                      variants={cardVariants}
                      transition={{ duration: 0.22 }}
                      className="w-full max-w-[22rem]"
                    >
                      <PostListCard
                        post={post}
                        selected={selectedIds.has(post.postId)}
                        onToggleSelect={toggleSelect}
                        onOpen={openPostDetail}
                        onRetry={(pid) => void handleRetryOne(pid)}
                        retryBusy={
                          retryMu.isPending && retryMu.variables === post.postId
                        }
                      />
                    </motion.div>
                  ))}
            </motion.div>

            {!listLoading && posts.length === 0 ? (
              <motion.div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-canvas-300 bg-card px-6 py-14 text-center">
                <LayoutGrid
                  className="mb-3 size-10 text-muted-foreground/40"
                  aria-hidden
                />
                <p className="text-sm font-medium text-foreground">
                  No posts match these filters
                </p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Publish from an upload or adjust search and status filters.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => clearToolbar()}
                >
                  Clear filters
                </Button>
              </motion.div>
            ) : null}
          </>
        )}

        {showPaginationFooter ? (
          <motion.div className="flex flex-col items-center gap-4 border-t border-[color:var(--nt-border)] pt-6">
            <p className="text-center text-[13px] text-muted-foreground">
              Showing{" "}
              <span className="font-medium text-foreground">
                {rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()}
              </span>{" "}
              of{" "}
              <span className="font-medium text-foreground">
                {listTotal.toLocaleString()}
              </span>
              {totalPages > 1 ? (
                <>
                  {" "}
                  · Page{" "}
                  <span className="font-medium text-foreground">
                    {page}
                  </span> of{" "}
                  <span className="font-medium text-foreground">
                    {totalPages}
                  </span>
                </>
              ) : null}
            </p>
            {totalPages > 1 ? (
              <PersistedShadcnPagination
                page={page}
                totalPages={totalPages}
                onPageChange={goToPage}
                className="mx-0 w-full justify-center sm:justify-end"
              />
            ) : null}
          </motion.div>
        ) : null}
      </motion.div>
    </PageShell>
  )
}
