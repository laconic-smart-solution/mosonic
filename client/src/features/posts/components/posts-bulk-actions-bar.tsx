import { useState } from "react"
import { CalendarClock, Loader2, Send, Trash2, X } from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export type PostsBulkActionsBarProps = {
  selectedCount: number
  scheduleLocal: string
  onScheduleLocalChange: (value: string) => void
  onScheduleConfirm: () => void
  onPublishNow: () => void
  onDeleteConfirm: () => void
  onClearSelection: () => void
  schedulePending?: boolean
  publishPending?: boolean
  deletePending?: boolean
  className?: string
}

export function PostsBulkActionsBar({
  selectedCount,
  scheduleLocal,
  onScheduleLocalChange,
  onScheduleConfirm,
  onPublishNow,
  onDeleteConfirm,
  onClearSelection,
  schedulePending = false,
  publishPending = false,
  deletePending = false,
  className,
}: PostsBulkActionsBarProps) {
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const busy = schedulePending || publishPending || deletePending

  function handleScheduleConfirm() {
    onScheduleConfirm()
    setScheduleOpen(false)
  }

  return (
    <div
      role="region"
      aria-label="Bulk post actions"
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-[color:var(--nt-border)] bg-[color:var(--nt-surface)] px-3 py-3 shadow-[var(--nt-surface-shadow)] sm:flex-row sm:items-center sm:justify-between sm:px-4",
        className
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
        <span className="inline-flex items-center rounded-md bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground tabular-nums">
          {selectedCount} selected
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
          disabled={busy}
          onClick={onClearSelection}
        >
          <X className="size-3.5" aria-hidden />
          Clear
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <Popover open={scheduleOpen} onOpenChange={setScheduleOpen}>
          <PopoverTrigger
            disabled={busy || selectedCount === 0}
            render={
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 gap-1.5 border-[#185FA5] text-[#185FA5] hover:bg-[#E6F1FB]"
                aria-expanded={scheduleOpen}
              >
                {schedulePending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <CalendarClock className="size-4" aria-hidden />
                )}
                Schedule
              </Button>
            }
          />
          <PopoverContent
            align="end"
            side="bottom"
            sideOffset={8}
            className="z-70 w-[min(320px,calc(100vw-2rem))] gap-4 p-4"
          >
            <PopoverHeader className="space-y-0.5 pb-1">
              <PopoverTitle className="text-base">
                Schedule selected posts
              </PopoverTitle>
              <p className="text-xs text-muted-foreground">
                Applies the same time to all {selectedCount} selected post
                {selectedCount === 1 ? "" : "s"}.
              </p>
            </PopoverHeader>
            <div className="space-y-2">
              <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                Publish at
              </p>
              <Input
                type="datetime-local"
                value={scheduleLocal}
                onChange={(e) => onScheduleLocalChange(e.target.value)}
                className="h-10 w-full text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-border/60 pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={schedulePending}
                onClick={() => setScheduleOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                className="border-[#185FA5] bg-[#E6F1FB] text-[#042C53] hover:bg-[#B5D4F4]"
                disabled={schedulePending}
                onClick={() => void handleScheduleConfirm()}
              >
                Confirm
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-9 gap-1.5 border-[#185FA5] text-[#185FA5] hover:bg-[#E6F1FB]"
          disabled={busy || selectedCount === 0}
          title="Publishes pending, scheduled, partial, or failed posts immediately"
          onClick={() => void onPublishNow()}
        >
          {publishPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Send className="size-4" aria-hidden />
          )}
          Publish now
        </Button>

        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9 gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
            disabled={busy || selectedCount === 0}
            onClick={() => setDeleteOpen(true)}
          >
            {deletePending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Trash2 className="size-4" aria-hidden />
            )}
            Delete
          </Button>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Delete {selectedCount} selected post
                {selectedCount === 1 ? "" : "s"}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Scheduled and draft posts are removed. Published posts are
                unpublished where supported; Instagram, TikTok, and Snapchat may
                remain live.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deletePending}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={deletePending}
                onClick={() => {
                  setDeleteOpen(false)
                  onDeleteConfirm()
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
