import { useTranslation } from "react-i18next"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { HomeRecentSlot } from "@/features/home/lib/home-recent-slots"

type HomeRecentRailProps = {
  slots: readonly HomeRecentSlot[]
  isLoading: boolean
  hovRight: number | null
  onHover: (i: number | null) => void
  onOpenContent: (contentId: string, uploadId?: string) => void
}

function RecentSkeletonRow() {
  return (
    <div className="flex size-[52px] items-center justify-center rounded-xl border border-border bg-card shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
      <div className="size-[30px] animate-pulse rounded-lg bg-muted" />
    </div>
  )
}

export function HomeRecentRail({
  slots,
  isLoading,
  hovRight,
  onHover,
  onOpenContent,
}: HomeRecentRailProps) {
  const { t } = useTranslation("home")

  if (isLoading) {
    return (
      <div className="flex flex-col items-center gap-2.5">
        <RecentSkeletonRow />
        <RecentSkeletonRow />
        <RecentSkeletonRow />
        <div className="mt-0.5 text-[9px] font-semibold tracking-[0.8px] text-muted-foreground uppercase">
          {t("recent.label")}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-2.5">
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
              className="flex size-[52px] cursor-pointer items-center justify-center rounded-xl border border-border bg-card transition-all duration-150"
              style={{
                borderColor,
                boxShadow: shadow,
                transform: scale,
              }}
            >
              <div
                className="flex size-[30px] items-center justify-center rounded-lg text-xs font-bold"
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
              side="left"
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
      <div className="mt-0.5 text-[9px] font-semibold tracking-[0.8px] text-muted-foreground uppercase">
        {t("recent.label")}
      </div>
    </div>
  )
}
