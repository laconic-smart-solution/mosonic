import { useNavigate } from "react-router-dom"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
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
          {isLoading ? <p className="text-sm text-muted-foreground">Loading...</p> : null}
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
                className="w-full rounded border p-3 text-left transition hover:bg-muted/30"
                onClick={() => {
                  onOpenChange(false)
                  navigate(
                    item.uploadId
                      ? `/upload/${item.uploadId}`
                      : `/content/${item.contentId}`
                  )
                }}
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold">{item.contentId}</p>
                  <span className="text-[11px] capitalize text-muted-foreground">
                    {item.status}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Updated {new Date(item.updatedAt).toLocaleString()}
                </p>
              </button>
            ))}
          </div>
          {canViewMore ? (
            <button
              type="button"
              className="mt-3 w-full rounded border px-3 py-2 text-xs font-medium"
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
