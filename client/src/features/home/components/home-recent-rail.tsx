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
  onOpenLibrary: () => void
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
  onOpenLibrary,
}: HomeRecentRailProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center gap-2.5">
        <RecentSkeletonRow />
        <RecentSkeletonRow />
        <RecentSkeletonRow />
        <div className="mt-0.5 text-[9px] font-semibold tracking-[0.8px] text-muted-foreground uppercase">Recent</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-2.5">
      {slots.map((slot, i) => {
        const key = slot.kind === "content" ? slot.contentId : `empty-${i}`
        const item = slot.kind === "content" ? slot : null
        const borderColor = item && hovRight === i ? `${item.color}50` : undefined
        const shadow =
          item && hovRight === i
            ? `0 4px 16px ${item.color}20, 0 1px 3px rgba(0,0,0,0.06)`
            : "0 1px 3px rgba(0,0,0,0.05)"
        const scale = item && hovRight === i ? "scale(1.06)" : "scale(1)"

        const tooltipTitle =
          slot.kind === "content" ? slot.label : "No recent item"
        const tooltipSub =
          slot.kind === "content" ? slot.updated : "Open content library"

        return (
          <Tooltip key={key}>
            <TooltipTrigger
              type="button"
              onClick={() =>
                slot.kind === "content"
                  ? onOpenContent(slot.contentId, slot.uploadId)
                  : onOpenLibrary()
              }
              onMouseEnter={() => onHover(i)}
              onMouseLeave={() => onHover(null)}
              className="flex size-[52px] cursor-pointer items-center justify-center rounded-xl border border-border bg-card transition-all duration-150"
              style={{
                borderColor:
                  slot.kind === "empty" && hovRight === i
                    ? "var(--muted-foreground)"
                    : borderColor,
                boxShadow:
                  slot.kind === "empty" && hovRight === i
                    ? "0 4px 12px rgba(0,0,0,0.08)"
                    : shadow,
                transform: slot.kind === "empty" && hovRight === i ? "scale(1.06)" : scale,
              }}
            >
              {slot.kind === "content" ? (
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
              ) : (
                <div className="text-lg leading-none font-semibold text-muted-foreground">+</div>
              )}
            </TooltipTrigger>
            <TooltipContent
              side="left"
              align="center"
              sideOffset={10}
              className="flex max-w-[min(280px,calc(100vw-6rem))] flex-col items-stretch gap-0.5 px-3 py-2"
            >
              <span className="font-semibold">{tooltipTitle}</span>
              <span className="text-[11px] text-background/80">{tooltipSub}</span>
            </TooltipContent>
          </Tooltip>
        )
      })}
      <div className="mt-0.5 text-[9px] font-semibold tracking-[0.8px] text-muted-foreground uppercase">Recent</div>
    </div>
  )
}
