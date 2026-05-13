import { useEffect, useMemo, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { CircleAlertIcon, InboxIcon, Search, X } from "lucide-react"
import { motion } from "framer-motion"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
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
import { useAuthStoreHydrated } from "@/shared/hooks/use-auth-store-hydrated"
import { useContentPageQuery } from "@/shared/queries/content.query"
import type {
  ContentPageQueryPayload,
  ContentStatus,
} from "@/shared/types/content.type"

const SEARCH_DEBOUNCE_MS = 300
import { cn } from "@/lib/utils"

export default function ContentPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const hydrated = useAuthStoreHydrated()
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(12)
  const [statusFilter, setStatusFilter] = useState<"all" | ContentStatus>("all")
  const [searchInput, setSearchInput] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [sortOption, setSortOption] = useState<SortOption>("newest")
  const [filterHasImage, setFilterHasImage] = useState(false)
  const [filterHasVideo, setFilterHasVideo] = useState(false)
  const [filterHasSummary, setFilterHasSummary] = useState(false)

  useEffect(() => {
    const q = searchParams.get("search")?.trim()
    if (!q) {
      return
    }
    setSearchInput(q)
    setDebouncedSearch(q)
  }, [searchParams])

  useEffect(() => {
    const id = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim())
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(id)
  }, [searchInput])

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch])

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
    setPage(1)
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
        <div className="relative max-w-[380px] min-w-[220px] flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-canvas-500"
            aria-hidden
          />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by campaign, workflow, pipeline, or content id…"
            className="h-[38px] rounded-lg border-canvas-300 bg-card pr-3 pl-10 text-[13px] text-navy-700 placeholder:text-canvas-400 focus-visible:border-teal-400 focus-visible:ring-teal-400/30"
          />
        </div>

        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v as "all" | ContentStatus)
            setPage(1)
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
            setLimit(Number(v) as (typeof PAGE_SIZE_OPTIONS)[number])
            setPage(1)
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
              setPage(1)
            }}
          />
          <span className="text-[13px] text-navy-700">Has image</span>
        </Label>
        <Label className="flex cursor-pointer items-center gap-2 font-normal">
          <Checkbox
            checked={filterHasVideo}
            onCheckedChange={(v) => {
              setFilterHasVideo(v === true)
              setPage(1)
            }}
          />
          <span className="text-[13px] text-navy-700">Has video</span>
        </Label>
        <Label className="flex cursor-pointer items-center gap-2 font-normal">
          <Checkbox
            checked={filterHasSummary}
            onCheckedChange={(v) => {
              setFilterHasSummary(v === true)
              setPage(1)
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
              setPage(1)
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

      {!isPending && !isError && meta && totalPages > 0 ? (
        <div className="mt-8 flex flex-col items-center justify-between gap-4 border-t border-canvas-200 pt-6 sm:flex-row">
          <p className="text-[13px] text-canvas-500">
            Page <strong className="text-navy-700">{meta.page}</strong> of{" "}
            <strong className="text-navy-700">{meta.totalPages}</strong>
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-lg border-canvas-300"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-lg border-canvas-300"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </ContentPageShell>
  )
}
