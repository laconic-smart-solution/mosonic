import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { CircleAlertIcon, InboxIcon, X } from "lucide-react"
import { motion } from "framer-motion"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { ContentListCard } from "@/features/content/components/content-list/content-list-card"
import {
  PAGE_SIZE_OPTIONS,
  type SortOption,
} from "@/features/content/components/content-list/content-list-constants"
import { ContentListStatCard } from "@/features/content/components/content-list/content-list-stat-card"
import { ContentPageShell } from "@/features/content/components/content-list/content-page-shell"
import { PersistedShadcnPagination } from "@/components/core/persisted-shadcn-pagination"
import { useAuthStoreHydrated } from "@/shared/hooks/use-auth-store-hydrated"
import { useContentPageQuery } from "@/shared/queries/content.query"
import type {
  ContentPageQueryPayload,
  ContentStatus,
} from "@/shared/types/content.type"
import {
  readListPagination,
  setListLimitInParams,
  setListPageInParams,
  type ListPaginationDefaults,
} from "@/lib/list-pagination-url"
import { cn } from "@/lib/utils"

const SEARCH_DEBOUNCE_MS = 300

const CONTENT_PAGINATION_DEFAULTS: ListPaginationDefaults = {
  defaultPage: 1,
  defaultLimit: 12,
  allowedLimits: PAGE_SIZE_OPTIONS,
}

export default function ContentPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const hydrated = useAuthStoreHydrated()

  const { page, limit } = useMemo(
    () => readListPagination(searchParams, CONTENT_PAGINATION_DEFAULTS),
    [searchParams]
  )

  const goToPage = useCallback(
    (next: number) => {
      setSearchParams(
        (prev) => setListPageInParams(prev, next, CONTENT_PAGINATION_DEFAULTS),
        { replace: true }
      )
    },
    [setSearchParams]
  )

  const resetToFirstPage = useCallback(() => {
    setSearchParams(
      (prev) => setListPageInParams(prev, 1, CONTENT_PAGINATION_DEFAULTS),
      { replace: true }
    )
  }, [setSearchParams])

  const setLimitFromUrl = useCallback(
    (n: (typeof PAGE_SIZE_OPTIONS)[number]) => {
      setSearchParams(
        (prev) => setListLimitInParams(prev, n, CONTENT_PAGINATION_DEFAULTS),
        { replace: true }
      )
    },
    [setSearchParams]
  )

  const [statusFilter, setStatusFilter] = useState<"all" | ContentStatus>("all")
  const [searchInput, setSearchInput] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [sortOption, setSortOption] = useState<SortOption>("newest")
  const [filterHasImage, setFilterHasImage] = useState(false)
  const [filterHasVideo, setFilterHasVideo] = useState(false)
  const [filterHasSummary, setFilterHasSummary] = useState(false)

  /** When true, next debouncedSearch change came from URL (?search=), do not reset page. */
  const skipPageResetFromUrlSearch = useRef(false)

  useEffect(() => {
    const q = searchParams.get("search")?.trim()
    if (!q) {
      return
    }
    skipPageResetFromUrlSearch.current = true
    setSearchInput(q)
    setDebouncedSearch(q)
  }, [searchParams])

  useEffect(() => {
    const id = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim())
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(id)
  }, [searchInput])

  const searchPageResetSkip = useRef(true)
  useEffect(() => {
    if (searchPageResetSkip.current) {
      searchPageResetSkip.current = false
      return
    }
    if (skipPageResetFromUrlSearch.current) {
      skipPageResetFromUrlSearch.current = false
      return
    }
    resetToFirstPage()
  }, [debouncedSearch, resetToFirstPage])

  const payload = useMemo(() => {
    const filter: NonNullable<ContentPageQueryPayload["filter"]> = {}
    if (statusFilter !== "all") filter.status = statusFilter
    if (filterHasImage) filter.hasImage = true
    if (filterHasVideo) filter.hasVideo = true
    if (filterHasSummary) filter.hasSummary = true

    const hasFilter = Object.keys(filter).length > 0

    const search = debouncedSearch.length > 0 ? debouncedSearch : undefined

    return {
      page,
      limit,
      sortBy: "updatedAt" as const,
      sortOrder: sortOption === "oldest" ? ("asc" as const) : ("desc" as const),
      search,
      filter: hasFilter ? filter : undefined,
    }
  }, [
    page,
    limit,
    statusFilter,
    sortOption,
    filterHasImage,
    filterHasVideo,
    filterHasSummary,
    debouncedSearch,
  ])

  const queryEnabled = hydrated
  const { data, isPending, isError, error, refetch } = useContentPageQuery(
    payload,
    queryEnabled
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

  const sortedItems = useMemo(() => {
    const list = [...items]
    if (sortOption === "title") {
      list.sort(
        (a, b) =>
          a.ruleRef.localeCompare(b.ruleRef) ||
          a.contentId.localeCompare(b.contentId)
      )
    } else if (sortOption === "status") {
      list.sort(
        (a, b) =>
          a.status.localeCompare(b.status) ||
          b.updatedAt.localeCompare(a.updatedAt)
      )
    }
    return list
  }, [items, sortOption])

  const totalAll = meta?.total ?? 0
  const draftPage = items.filter((i) => i.status === "draft").length
  const approvedPage = items.filter((i) => i.status === "approved").length
  const rejectedPage = items.filter((i) => i.status === "rejected").length

  const empty =
    !isPending &&
    !isError &&
    queryEnabled &&
    items.length === 0 &&
    (meta?.total ?? 0) === 0

  const errorMessage =
    error instanceof Error ? error.message : "Failed to load content."

  function clearFilters() {
    setSearchInput("")
    setDebouncedSearch("")
    setStatusFilter("all")
    setSortOption("newest")
    setFilterHasImage(false)
    setFilterHasVideo(false)
    setFilterHasSummary(false)
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete("search")
        return setListPageInParams(next, 1, CONTENT_PAGINATION_DEFAULTS)
      },
      { replace: true }
    )
  }

  if (!hydrated) {
    return (
      <div className="space-y-6 bg-canvas-100 px-5 py-6 md:px-7 md:py-7">
        <Skeleton className="h-9 w-56 max-w-full bg-canvas-200" />
        <div className="flex flex-wrap gap-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton
              key={i}
              className="h-[76px] min-w-[130px] flex-1 rounded-xl bg-canvas-200"
            />
          ))}
        </div>
        <Skeleton className="h-10 max-w-md bg-canvas-200" />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[340px] rounded-2xl bg-canvas-200" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <ContentPageShell>
      <motion.header
        className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-start"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div>
          <h1 className="font-heading text-[26px] leading-tight tracking-tight text-navy-700">
            Content library
          </h1>
          <p className="mt-1 text-[13px] text-canvas-500">
            All generated content across campaigns
          </p>
        </div>
      </motion.header>

      {!isPending && !isError && meta ? (
        <div className="mb-6 flex flex-wrap gap-2.5">
          <ContentListStatCard value={totalAll} label="Total content" />
          <ContentListStatCard
            value={draftPage}
            label="Draft"
            dotClass="bg-amber-400"
          />
          <ContentListStatCard
            value={approvedPage}
            label="Approved"
            dotClass="bg-teal-400"
          />
          <ContentListStatCard
            value={rejectedPage}
            label="Rejected"
            dotClass="bg-navy-500"
          />
        </div>
      ) : null}
      {meta && meta.totalPages > 1 ? (
        <p className="mb-4 text-xs text-canvas-500">
          Draft, approved, and rejected counts reflect items on the current page
          only.
        </p>
      ) : null}

      <div className="mb-5 flex flex-wrap items-center gap-2.5">
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v as "all" | ContentStatus)
            resetToFirstPage()
          }}
        >
          <SelectTrigger className="h-[38px] w-full rounded-lg border-canvas-300 bg-card sm:w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={String(limit)}
          onValueChange={(v) => {
            setLimitFromUrl(Number(v) as (typeof PAGE_SIZE_OPTIONS)[number])
          }}
        >
          <SelectTrigger className="h-[38px] w-full rounded-lg border-canvas-300 bg-card sm:w-[140px]">
            <SelectValue placeholder="Per page" />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n} per page
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-[38px] rounded-lg border-canvas-300 bg-card px-3.5 text-[13px] text-canvas-600 hover:border-canvas-500 hover:text-navy-700"
            onClick={clearFilters}
          >
            <X className="mr-1 size-3.5" />
            Clear
          </Button>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-canvas-200 pb-5">
        <span className="text-[11px] font-semibold tracking-wider text-canvas-500 uppercase">
          Outputs
        </span>
        <Label className="flex cursor-pointer items-center gap-2 font-normal">
          <Checkbox
            checked={filterHasImage}
            onCheckedChange={(v) => {
              setFilterHasImage(v === true)
              resetToFirstPage()
            }}
          />
          <span className="text-[13px] text-navy-700">Has image</span>
        </Label>
        <Label className="flex cursor-pointer items-center gap-2 font-normal">
          <Checkbox
            checked={filterHasVideo}
            onCheckedChange={(v) => {
              setFilterHasVideo(v === true)
              resetToFirstPage()
            }}
          />
          <span className="text-[13px] text-navy-700">Has video</span>
        </Label>
        <Label className="flex cursor-pointer items-center gap-2 font-normal">
          <Checkbox
            checked={filterHasSummary}
            onCheckedChange={(v) => {
              setFilterHasSummary(v === true)
              resetToFirstPage()
            }}
          />
          <span className="text-[13px] text-navy-700">Has summary</span>
        </Label>
      </div>

      {isError ? (
        <Alert variant="destructive" className="mb-6">
          <CircleAlertIcon />
          <AlertTitle>Could not load content</AlertTitle>
          <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>{errorMessage}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {!isPending && !isError && meta ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-[13px] text-canvas-500">
          <span>
            Showing{" "}
            <strong className="font-medium text-navy-700">
              {sortedItems.length}
            </strong>{" "}
            of{" "}
            <strong className="font-medium text-navy-700">
              {items.length}
            </strong>{" "}
            on this page
            {meta.total != null ? (
              <>
                {" "}
                ·{" "}
                <strong className="font-medium text-navy-700">
                  {meta.total}
                </strong>{" "}
                total
              </>
            ) : null}
          </span>
          <Select
            value={sortOption}
            onValueChange={(v) => {
              setSortOption(v as SortOption)
              resetToFirstPage()
            }}
          >
            <SelectTrigger className="h-auto w-fit min-w-[140px] border-0 bg-transparent text-[13px] text-canvas-600 shadow-none focus:ring-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="title">Campaign A → Z</SelectItem>
              <SelectItem value="status">By status</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {empty ? (
        <div className="flex flex-col items-center py-20 text-center text-canvas-500">
          <InboxIcon className="mb-4 size-12 text-canvas-300" aria-hidden />
          <h3 className="mb-1.5 text-base font-semibold text-navy-700">
            No content yet
          </h3>
          <p className="max-w-sm text-[13px]">
            {debouncedSearch
              ? "No content matched your search or filters."
              : "Run a workflow to generate content, or relax the status filter."}
          </p>
        </div>
      ) : null}

      {(isPending || (!empty && !isError && items.length > 0)) && !isError ? (
        <div
          className={cn(
            "grid grid-cols-[repeat(auto-fill,minmax(290px,1fr))] gap-4",
            empty && "hidden"
          )}
        >
          {isPending
            ? Array.from({ length: Math.min(limit, 6) }).map((_, i) => (
                <div
                  key={i}
                  className="overflow-hidden rounded-2xl border border-canvas-200 bg-card"
                >
                  <Skeleton className="h-40 rounded-none bg-canvas-200" />
                  <div className="space-y-2 p-4">
                    <Skeleton className="h-3 w-24 bg-canvas-200" />
                    <Skeleton className="h-5 w-full bg-canvas-200" />
                    <Skeleton className="h-8 w-full bg-canvas-200" />
                  </div>
                </div>
              ))
            : sortedItems.map((item, idx) => (
                <ContentListCard
                  key={item.contentId}
                  item={item}
                  index={idx}
                  onOpen={(id, uid) =>
                    navigate(uid ? `/upload/${uid}` : `/content/${id}`)
                  }
                />
              ))}
        </div>
      ) : null}

      {!isPending && !isError && meta && totalPages > 1 ? (
        <div className="mt-8 flex flex-col items-center justify-between gap-4 border-t border-canvas-200 pt-6 sm:flex-row">
          <p className="text-[13px] text-canvas-500">
            Page <strong className="text-navy-700">{meta.page}</strong> of{" "}
            <strong className="text-navy-700">{meta.totalPages}</strong>
          </p>
          <PersistedShadcnPagination
            page={page}
            totalPages={totalPages}
            onPageChange={goToPage}
            className="mx-0 w-full justify-end sm:w-auto"
          />
        </div>
      ) : null}
    </ContentPageShell>
  )
}
