import { Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  CHANNEL_FILTER_ALL,
  channelSelectLabel,
  DEFAULT_SORT,
  SORT_OPTIONS,
  VALID_CHANNELS,
} from "@/features/posts/lib/posts-filter-config"
import type { PostListSort } from "@/shared/types/post.type"

export type PostsToolbarProps = {
  searchInput: string
  onSearchChange: (value: string) => void
  channelFilter: string
  onChannelChange: (value: string) => void
  sort: PostListSort
  onSortChange: (value: PostListSort) => void
  limit: number
  allowedLimits: readonly number[]
  onLimitChange: (n: number) => void
  onClear: () => void
}

export function PostsToolbar({
  searchInput,
  onSearchChange,
  channelFilter,
  onChannelChange,
  sort,
  onSortChange,
  limit,
  allowedLimits,
  onLimitChange,
  onClear,
}: PostsToolbarProps) {
  const sortLabel =
    SORT_OPTIONS.find((o) => o.value === sort)?.label ?? sort

  return (
    <div className="overflow-hidden rounded-xl border border-[color:var(--nt-border)] bg-[color:var(--nt-surface)] shadow-[var(--nt-surface-shadow)]">
      {/* Row 1: search + clear */}
      <div className="flex flex-col gap-3 border-b border-border/60 p-3 sm:flex-row sm:items-end sm:gap-4 sm:p-4">
        <div className="relative min-w-0 flex-1 space-y-1.5">
          <Label
            htmlFor="posts-toolbar-search"
            className="text-[11px] uppercase tracking-wide text-muted-foreground"
          >
            Search
          </Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="posts-toolbar-search"
              value={searchInput}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search uploads, content, rules…"
              className="h-10 pl-9"
              aria-label="Search posts"
            />
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-10 w-full shrink-0 sm:w-auto sm:min-w-[88px]"
          onClick={onClear}
        >
          Clear
        </Button>
      </div>

      {/* Row 2: filters grid */}
      <div className="grid gap-3 p-3 sm:grid-cols-3 sm:gap-4 sm:p-4">
        <div className="min-w-0 space-y-1.5">
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Channel
          </Label>
          <Select
            value={channelFilter ? channelFilter : CHANNEL_FILTER_ALL}
            onValueChange={(v) => onChannelChange(v ?? CHANNEL_FILTER_ALL)}
          >
            <SelectTrigger className="h-10 w-full">
              <SelectValue>
                {channelSelectLabel(channelFilter)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={CHANNEL_FILTER_ALL}>All channels</SelectItem>
              {VALID_CHANNELS.map((c) => (
                <SelectItem key={c} value={c}>
                  {channelSelectLabel(c)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="min-w-0 space-y-1.5">
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Sort
          </Label>
          <Select
            value={sort}
            onValueChange={(v) => onSortChange((v as PostListSort) ?? DEFAULT_SORT)}
          >
            <SelectTrigger className="h-10 w-full">
              <SelectValue>{sortLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="min-w-0 space-y-1.5">
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Per page
          </Label>
          <Select
            value={String(limit)}
            onValueChange={(v) => {
              if (v == null) return
              onLimitChange(Number.parseInt(v, 10))
            }}
          >
            <SelectTrigger className="h-10 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {allowedLimits.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}
