import { CalendarClock, Loader2, Lock, Send } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

import type { UploadChannelStatus } from "@/shared/types/upload.type"

type UploadPublishControlsProps = {
  platformLabel: string
  serverStatus: UploadChannelStatus
  showSchedule: boolean
  scheduledLocal: string
  publishPending: boolean
  onPublishNow: () => void
  onToggleSchedule: () => void
  onScheduleChange: (v: string) => void
  onConfirmSchedule: () => void
  onEditScheduled?: () => void
}

export function UploadPublishControls({
  platformLabel,
  serverStatus,
  showSchedule,
  scheduledLocal,
  publishPending,
  onPublishNow,
  onToggleSchedule,
  onScheduleChange,
  onConfirmSchedule,
  onEditScheduled,
}: UploadPublishControlsProps) {
  const locked = serverStatus === "published" || serverStatus === "publishing"
  const canEditScheduled =
    serverStatus === "scheduled" && Boolean(onEditScheduled)

  const canAct = !locked && serverStatus !== "scheduled"

  return (
    <div className="mt-4 space-y-3 rounded-md border bg-muted/40 p-3">
      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {platformLabel} publish options
      </p>
      {canEditScheduled ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={publishPending}
          className="w-full border-[#185FA5] text-[#185FA5] hover:bg-[#E6F1FB]"
          onClick={onEditScheduled}
        >
          <CalendarClock className="mr-1 size-3.5" />
          Edit scheduled post
        </Button>
      ) : (
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!canAct || publishPending}
            className={cn(
              "flex-1 border-[#1D9E75] text-[#0F6E56]",
              "hover:bg-[#E1F5EE]"
            )}
            onClick={onPublishNow}
          >
            {serverStatus === "publishing" ? (
              <Loader2 className="mr-1 size-3.5 animate-spin" />
            ) : (
              <Send className="mr-1 size-3.5" />
            )}
            Publish now
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!canAct || publishPending}
            className={cn(
              "flex-1 border-[#185FA5] text-[#185FA5]",
              "hover:bg-[#E6F1FB]"
            )}
            onClick={onToggleSchedule}
          >
            <CalendarClock className="mr-1 size-3.5" />
            Schedule
          </Button>
        </div>
      )}
      {showSchedule && canAct ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="datetime-local"
            value={scheduledLocal}
            onChange={(e) => onScheduleChange(e.target.value)}
            className="h-9 min-w-[200px] flex-1 text-xs"
          />
          <Button
            type="button"
            size="sm"
            className="border-[#185FA5] bg-[#E6F1FB] text-[#042C53] hover:bg-[#B5D4F4]"
            disabled={publishPending}
            onClick={onConfirmSchedule}
          >
            Confirm
          </Button>
        </div>
      ) : null}
      {locked || serverStatus === "scheduled" ? (
        <div className="flex items-start gap-2 text-[11px] text-muted-foreground">
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
