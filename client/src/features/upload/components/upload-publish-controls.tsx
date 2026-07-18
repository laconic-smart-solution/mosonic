import { useEffect, useId, type RefObject } from "react"
import { useTranslation } from "react-i18next"
import { CalendarClock, Loader2, Lock, Send } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

import type { UploadChannelStatus } from "@/shared/types/upload.type"
import { TimezoneCombobox } from "./timezone-combobox"

type UploadPublishControlsProps = {
  scope?: "channel" | "global"
  platformLabel: string
  serverStatus?: UploadChannelStatus
  eligibleCount?: number
  /** When false, only publish-now is shown (e.g. RedNote). Default true. */
  scheduleSupported?: boolean
  /** When true, publish/schedule are disabled until the user saves. */
  unsavedChanges?: boolean
  schedulePopoverOpen: boolean
  schedulePopoverAnchorRef: RefObject<Element | null>
  scheduledLocal: string
  scheduleTimezone: string
  publishPending: boolean
  onPublishNow: () => void
  onScheduleOpenChange: (open: boolean) => void
  onScheduleChange: (v: string) => void
  onScheduleTimezoneChange: (timezone: string) => void
  onConfirmSchedule: () => void
  className?: string
}

export function UploadPublishControls({
  scope = "channel",
  platformLabel,
  serverStatus = "pending",
  eligibleCount = 0,
  scheduleSupported = true,
  unsavedChanges = false,
  schedulePopoverOpen,
  schedulePopoverAnchorRef,
  scheduledLocal,
  scheduleTimezone,
  publishPending,
  onPublishNow,
  onScheduleOpenChange,
  onScheduleChange,
  onScheduleTimezoneChange,
  onConfirmSchedule,
  className,
}: UploadPublishControlsProps) {
  const { t } = useTranslation(["upload", "common"])
  const datetimeId = useId()
  const datetimeHintId = `${datetimeId}-hint`
  const isGlobal = scope === "global"
  const locked =
    !isGlobal &&
    (serverStatus === "published" || serverStatus === "publishing")
  const isScheduled = !isGlobal && serverStatus === "scheduled"

  const canAct = isGlobal
    ? eligibleCount > 0 && !unsavedChanges
    : !locked && !isScheduled && !unsavedChanges

  const publishLabel = isGlobal
    ? t("upload:publish.publishAll")
    : t("upload:publish.publishNow")
  const scheduleLabel = isGlobal
    ? t("upload:publish.scheduleAll")
    : t("upload:publish.schedule")
  const regionLabel = isGlobal
    ? t("upload:publish.globalPublishing")
    : t("upload:publish.channelPublishing", { platform: platformLabel })

  useEffect(() => {
    if ((!canAct || !scheduleSupported) && schedulePopoverOpen) {
      onScheduleOpenChange(false)
    }
  }, [canAct, scheduleSupported, schedulePopoverOpen, onScheduleOpenChange])

  function handlePopoverOpenChange(open: boolean) {
    if (!open) {
      onScheduleOpenChange(false)
      return
    }
    if (canAct && scheduleSupported) {
      onScheduleOpenChange(true)
    }
  }

  return (
    <div
      className={cn("flex flex-col gap-2", className)}
      role="region"
      aria-label={regionLabel}
    >
      {!isScheduled ? (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!canAct || publishPending}
            className="h-9 border-[#1D9E75] px-4 text-[#0F6E56] hover:bg-[#E1F5EE] dark:hover:bg-[#1D9E75]/10"
            onClick={onPublishNow}
          >
            {serverStatus === "publishing" ? (
              <Loader2 className="mr-1 size-3.5 animate-spin" />
            ) : (
              <Send className="mr-1 size-3.5" />
            )}
            {publishLabel}
          </Button>

          {scheduleSupported ? (
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
                      "h-9 border-[#185FA5] px-4 text-[#185FA5] hover:bg-[#E6F1FB] dark:hover:bg-[#185FA5]/10",
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
                side="top"
                sideOffset={8}
                collisionPadding={12}
                className="z-70 w-[min(360px,calc(100vw-1.75rem))] gap-4 p-4"
              >
                <PopoverHeader className="space-y-0.5 pb-1">
                  <PopoverTitle className="text-base">
                    {isGlobal
                      ? t("upload:publish.scheduleAllChannels")
                      : t("upload:publish.schedulePublication")}
                  </PopoverTitle>
                  <p className="text-xs text-muted-foreground capitalize">
                    {isGlobal
                      ? `${eligibleCount} channel${eligibleCount === 1 ? "" : "s"}`
                      : platformLabel}
                  </p>
                </PopoverHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label
                      htmlFor={datetimeId}
                      className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase"
                    >
                      {t("upload:publish.whenToPublish")}
                    </Label>
                    <Input
                      id={datetimeId}
                      type="datetime-local"
                      value={scheduledLocal}
                      onChange={(e) => onScheduleChange(e.target.value)}
                      className="h-11 w-full min-w-0 text-sm"
                      aria-describedby={datetimeHintId}
                    />
                    <p id={datetimeHintId} className="sr-only">
                      {t("upload:publish.dateTime")}
                    </p>
                  </div>
                  <TimezoneCombobox
                    value={scheduleTimezone}
                    onChange={onScheduleTimezoneChange}
                    disabled={publishPending}
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
                    {t("common:actions.cancel")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-10 min-w-21 border-[#185FA5] bg-[#E6F1FB] text-[#042C53] hover:bg-[#B5D4F4]"
                    disabled={publishPending}
                    onClick={() => void onConfirmSchedule()}
                  >
                    {t("upload:publish.confirm")}
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          ) : null}
        </div>
      ) : null}

      {unsavedChanges && !locked && !isScheduled ? (
        <p className="text-right text-[11px] text-muted-foreground">
          {t("upload:publish.saveBeforePublish")}
        </p>
      ) : null}

      {!isGlobal && !scheduleSupported && canAct ? (
        <p className="text-[11px] text-muted-foreground">
          {t("upload:publish.rednotePublishOnly")}
        </p>
      ) : null}

      {!isGlobal && (locked || isScheduled) ? (
        <div className="flex items-start gap-2 rounded-md border border-border/40 bg-muted/30 px-2 py-1.5 text-[11px] text-muted-foreground">
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            {serverStatus === "published"
              ? t("upload:publish.publishedNoAction")
              : serverStatus === "scheduled"
                ? t("upload:publish.scheduledEditable")
                : t("upload:publish.publishingInProgress")}
          </span>
        </div>
      ) : null}
    </div>
  )
}
