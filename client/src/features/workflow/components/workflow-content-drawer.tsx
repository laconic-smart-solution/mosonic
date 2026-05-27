import { ChevronRight } from "lucide-react"
import { useNavigate } from "react-router-dom"

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { ContentListStatusBadge } from "@/features/content/components/content-list/content-list-status-badge"
import { formatRelativeTime } from "@/features/content/components/content-list/content-list-format"
import { contentDrawerItemTitle } from "@/features/content/lib/content-display"
import { cn } from "@/lib/utils"
import type { ContentPageItem } from "@/shared/types/content.type"

type WorkflowContentDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: ContentPageItem[]
  isLoading: boolean
  canViewMore: boolean
  isLoadingMore: boolean
  onViewMore: () => void
}

export function WorkflowContentDrawer({
  open,
  onOpenChange,
  items,
  isLoading,
  canViewMore,
  isLoadingMore,
  onViewMore,
}: WorkflowContentDrawerProps) {
  const navigate = useNavigate()

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="bottom">
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Generated Contents</DrawerTitle>
          <DrawerDescription>
            Latest generated content for this workflow.
          </DrawerDescription>
        </DrawerHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : null}
          {!isLoading && items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No content generated yet for this workflow.
            </p>
          ) : null}
          <div className="space-y-2">
            {items.map((item) => (
              <button
                key={item.contentId}
                type="button"
                className={cn(
                  "group flex w-full items-center gap-3 rounded-xl border border-canvas-200 p-3 text-left transition",
                  "hover:border-canvas-300 hover:bg-muted/30",
                )}
                onClick={() => {
                  onOpenChange(false)
                  navigate(
                    item.uploadId
                      ? `/upload/${item.uploadId}`
                      : `/content/${item.contentId}`,
                  )
                }}
              >
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                    <ContentListStatusBadge status={item.status} />
                    <span className="text-[11px] text-muted-foreground">
                      {formatRelativeTime(item.updatedAt)}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-sm leading-snug font-medium text-foreground">
                    {contentDrawerItemTitle(item)}
                  </p>
                </div>
                <ChevronRight
                  className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground"
                  aria-hidden
                />
              </button>
            ))}
          </div>
          {canViewMore ? (
            <button
              type="button"
              className="mt-3 w-full rounded-lg border px-3 py-2 text-xs font-medium transition hover:bg-muted/40"
              onClick={onViewMore}
              disabled={isLoadingMore}
            >
              {isLoadingMore ? "Loading more..." : "View More"}
            </button>
          ) : null}
        </div>
      </DrawerContent>
    </Drawer>
  )
}
