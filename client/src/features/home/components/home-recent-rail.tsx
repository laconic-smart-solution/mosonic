import { useTranslation } from "react-i18next"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { HomeRecentSlot } from "@/features/home/lib/home-recent-slots"

type HomeRecentRailProps = {
  slots: readonly HomeRecentSlot[]
  isLoading: boolean
  hovRight: number | null
  onHover: (i: number | null) => void
  onOpenContent: (contentId: string, uploadId?: string) => void
  layout?: "vertical" | "horizontal"
}

function RecentSkeletonRow({ compact }: { compact?: boolean }) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl border border-border bg-card shadow-[0_1px_3px_rgba(0,0,0,0.05)]",
        compact ? "size-11" : "size-[52px]",
      )}
    >
      <div className={cn("animate-pulse rounded-lg bg-muted", compact ? "size-6" : "size-[30px]")} />
    </div>
  )
}

export function HomeRecentRail({
  slots,
  isLoading,
  hovRight,
  onHover,
  onOpenContent,
  layout = "vertical",
}: HomeRecentRailProps) {
  const { t } = useTranslation("home")
  const isHorizontal = layout === "horizontal"

  if (isLoading) {
    return (
      <div
        className={cn(
          isHorizontal ? "flex w-full flex-col gap-2" : "flex flex-col items-center gap-2.5",
        )}
      >
        {isHorizontal ? (
          <div className="text-center text-[9px] font-semibold tracking-[0.8px] text-muted-foreground uppercase">
            {t("recent.label")}
          </div>
        ) : null}
        <div
          className={cn(
            isHorizontal
              ? "flex w-full justify-center gap-2 overflow-x-auto pb-1"
              : "flex flex-col items-center gap-2.5",
          )}
        >
          <RecentSkeletonRow compact={isHorizontal} />
          <RecentSkeletonRow compact={isHorizontal} />
          <RecentSkeletonRow compact={isHorizontal} />
        </div>
        {!isHorizontal ? (
          <div className="mt-0.5 text-[9px] font-semibold tracking-[0.8px] text-muted-foreground uppercase">
            {t("recent.label")}
          </div>
        ) : null}
      </div>
    )
  }

  if (slots.length === 0) {
    return null
  }

  return (
    <div
      className={cn(
        isHorizontal ? "flex w-full flex-col gap-2" : "flex flex-col items-center gap-2.5",
      )}
    >
      {isHorizontal ? (
        <div className="text-center text-[9px] font-semibold tracking-[0.8px] text-muted-foreground uppercase">
          {t("recent.label")}
        </div>
      ) : null}
      <div
        className={cn(
          isHorizontal
            ? "flex w-full justify-center gap-2 overflow-x-auto pb-1"
            : "flex flex-col items-center gap-2.5",
        )}
      >
        {slots.map((slot, i) => {
          const borderColor = hovRight === i ? `${slot.color}50` : undefined
          const shadow =
            hovRight === i
              ? `0 4px 16px ${slot.color}20, 0 1px 3px rgba(0,0,0,0.06)`
              : "0 1px 3px rgba(0,0,0,0.05)"
          const scale = hovRight === i ? "scale(1.06)" : "scale(1)"

          return (
            <Tooltip key={slot.contentId}>
              <TooltipTrigger
                type="button"
                onClick={() => onOpenContent(slot.contentId, slot.uploadId)}
                onMouseEnter={() => onHover(i)}
                onMouseLeave={() => onHover(null)}
                className={cn(
                  "flex shrink-0 cursor-pointer items-center justify-center rounded-xl border border-border bg-card transition-all duration-150",
                  isHorizontal ? "size-11" : "size-[52px]",
                )}
                style={{
                  borderColor,
                  boxShadow: shadow,
                  transform: scale,
                }}
              >
                <div
                  className={cn(
                    "flex items-center justify-center rounded-lg font-bold",
                    isHorizontal ? "size-6 text-[10px]" : "size-[30px] text-xs",
                  )}
                  style={{
                    background: `linear-gradient(135deg,${slot.color}20,${slot.color}35)`,
                    border: `1.5px solid ${slot.color}40`,
                    color: slot.color,
                  }}
                >
                  {slot.initial}
                </div>
              </TooltipTrigger>
              <TooltipContent
                side={isHorizontal ? "top" : "left"}
                align="center"
                sideOffset={10}
                className="flex max-w-[min(280px,calc(100vw-6rem))] flex-col items-stretch gap-0.5 px-3 py-2"
              >
                <span className="font-semibold">{slot.label}</span>
                <span className="text-[11px] text-background/80">{slot.updated}</span>
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>
      {!isHorizontal ? (
        <div className="mt-0.5 text-[9px] font-semibold tracking-[0.8px] text-muted-foreground uppercase">
          {t("recent.label")}
        </div>
      ) : null}
    </div>
  )
}
