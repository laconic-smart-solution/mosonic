import { useEffect, type RefObject } from "react"
import { CalendarClock, Loader2, Lock, Send } from "lucide-react"

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

import type { UploadChannelStatus } from "@/shared/types/upload.type"

type UploadPublishControlsProps = {
  scope?: "channel" | "global"
  platformLabel: string
  serverStatus?: UploadChannelStatus
  eligibleCount?: number
  schedulePopoverOpen: boolean
  schedulePopoverAnchorRef: RefObject<Element | null>
  scheduledLocal: string
  publishPending: boolean
  onPublishNow: () => void
  onScheduleOpenChange: (open: boolean) => void
  onScheduleChange: (v: string) => void
  onConfirmSchedule: () => void
  onEditScheduled?: () => void
  className?: string
}

export function UploadPublishControls({
  scope = "channel",
  platformLabel,
  serverStatus = "pending",
  eligibleCount = 0,
  schedulePopoverOpen,
  schedulePopoverAnchorRef,
  scheduledLocal,
  publishPending,
  onPublishNow,
  onScheduleOpenChange,
  onScheduleChange,
  onConfirmSchedule,
  onEditScheduled,
  className,
}: UploadPublishControlsProps) {
  const isGlobal = scope === "global"
  const locked =
    !isGlobal &&
    (serverStatus === "published" || serverStatus === "publishing")
  const canEditScheduled =
    !isGlobal &&
    serverStatus === "scheduled" &&
    Boolean(onEditScheduled)

  const canAct = isGlobal
    ? eligibleCount > 0
    : !locked && serverStatus !== "scheduled"

  const publishLabel = isGlobal ? "Publish all included" : "Publish now"
  const scheduleLabel = isGlobal ? "Schedule all included" : "Schedule"
  const regionLabel = isGlobal
    ? "Global publishing"
    : `${platformLabel} publishing`

  useEffect(() => {
    if (!canAct && schedulePopoverOpen) {
      onScheduleOpenChange(false)
    }
  }, [canAct, schedulePopoverOpen, onScheduleOpenChange])

  function handlePopoverOpenChange(open: boolean) {
    if (!open) {
      onScheduleOpenChange(false)
      return
    }
    if (canAct) {
      onScheduleOpenChange(true)
    }
  }

  return (
    <div
      className={cn("flex flex-col gap-2 px-3 py-2 sm:px-4", className)}
      role="region"
      aria-label={regionLabel}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-baseline gap-2">
          {/* <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            {platformLabel}
          </span>
          <span className="truncate text-[11px] font-medium text-muted-foreground/80">
            Publish
          </span> */}
        </div>

        {canEditScheduled ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={publishPending}
            className="h-9 shrink-0 border-[#185FA5] text-[#185FA5] hover:bg-[#E6F1FB]"
            onClick={onEditScheduled}
          >
            <CalendarClock className="mr-1 size-3.5" />
            Edit scheduled post
          </Button>
        ) : (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!canAct || publishPending}
              className="h-9 border-[#1D9E75] px-4 text-[#0F6E56] hover:bg-[#E1F5EE]"
              onClick={onPublishNow}
            >
              {serverStatus === "publishing" ? (
                <Loader2 className="mr-1 size-3.5 animate-spin" />
              ) : (
                <Send className="mr-1 size-3.5" />
              )}
              {publishLabel}
            </Button>

            <Popover
              modal={false}
              open={schedulePopoverOpen}
              onOpenChange={handlePopoverOpenChange}
            >
              <PopoverTrigger
                disabled={!canAct || publishPending}
                render={
                  <Button
                    type="button"
                    size="sm"
                    variant={schedulePopoverOpen ? "secondary" : "outline"}
                    className={cn(
                      "h-9 border-[#185FA5] px-4 text-[#185FA5] hover:bg-[#E6F1FB]",
                      schedulePopoverOpen && "border-[#185FA5] bg-[#E6F1FB]"
                    )}
                    aria-expanded={schedulePopoverOpen}
                    aria-haspopup="dialog"
                  >
                    <CalendarClock className="mr-1 size-3.5" />
                    {scheduleLabel}
                  </Button>
                }
              />
              <PopoverContent
                anchor={schedulePopoverAnchorRef}
                positionMethod="fixed"
                align="end"
                side="bottom"
                sideOffset={8}
                collisionPadding={12}
                className="z-70 w-[min(340px,calc(100vw-1.75rem))] gap-4 p-4"
              >
                <PopoverHeader className="space-y-0.5 pb-1">
                  <PopoverTitle className="text-base">
                    {isGlobal
                      ? "Schedule all included channels"
                      : "Schedule publication"}
                  </PopoverTitle>
                  <p className="text-xs text-muted-foreground capitalize">
                    {isGlobal
                      ? `${eligibleCount} channel${eligibleCount === 1 ? "" : "s"}`
                      : platformLabel}
                  </p>
                </PopoverHeader>
                <div className="space-y-2">
                  <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                    When to publish
                  </p>
                  <Input
                    type="datetime-local"
                    value={scheduledLocal}
                    onChange={(e) => onScheduleChange(e.target.value)}
                    className="h-11 w-full min-w-0 text-sm"
                  />
                </div>
                <div className="flex flex-wrap justify-end gap-2 border-t border-border/60 pt-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={publishPending}
                    className="h-10"
                    onClick={() => onScheduleOpenChange(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-10 min-w-21 border-[#185FA5] bg-[#E6F1FB] text-[#042C53] hover:bg-[#B5D4F4]"
                    disabled={publishPending}
                    onClick={() => void onConfirmSchedule()}
                  >
                    Confirm
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        )}
      </div>

      {!isGlobal && (locked || serverStatus === "scheduled") ? (
        <div className="flex items-start gap-2 rounded-md border border-border/40 bg-muted/30 px-2 py-1.5 text-[11px] text-muted-foreground">
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            {serverStatus === "published"
              ? "Published — no further action needed"
              : serverStatus === "scheduled"
                ? "Scheduled — caption, schedule time, and YouTube title can still be edited"
                : "Publishing in progress…"}
          </span>
        </div>
      ) : null}
    </div>
  )
}
