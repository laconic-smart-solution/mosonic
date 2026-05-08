import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { useEffect, useRef } from "react"
import { STATUS_COLOR, type RuleStatus, type RuleSummary } from "@/features/rules/data/rules-mock"
import { T } from "@/lib/tokens"
import { RuleChip, type RuleChipTone } from "./rule-chip"

function statusToChipTone(status: RuleStatus): RuleChipTone {
  const token = STATUS_COLOR[status]
  if (token === "green") return "green"
  if (token === "amber") return "amber"
  return "gray"
}

type RulesListDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  summaries: RuleSummary[]
  selectedRuleId: string
  onSelectRule: (ruleId: string) => void
  hasMore: boolean
  isLoadingMore: boolean
  onLoadMore: () => void
}

export function RulesListDrawer({
  open,
  onOpenChange,
  summaries,
  selectedRuleId,
  onSelectRule,
  hasMore,
  isLoadingMore,
  onLoadMore,
}: RulesListDrawerProps) {
  const loadMoreRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open || !hasMore || isLoadingMore) return
    const target = loadMoreRef.current
    if (!target) return
    const scrollRoot = target.parentElement
    if (!scrollRoot) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore()
      },
      { root: scrollRoot, rootMargin: "120px 0px 120px 0px" }
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [hasMore, isLoadingMore, onLoadMore, open, summaries.length])

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction="right">
      <DrawerContent className="data-[vaul-drawer-direction=right]:w-[420px] data-[vaul-drawer-direction=right]:sm:max-w-[420px]">
        <DrawerHeader>
          <DrawerTitle>Rules list</DrawerTitle>
          <DrawerDescription>Select a rule to update the canvas.</DrawerDescription>
        </DrawerHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-4">
          {summaries.map((summary) => {
            const isSelected = summary.ruleId === selectedRuleId
            return (
              <button
                key={summary.ruleId}
                type="button"
                onClick={() => {
                  onSelectRule(summary.ruleId)
                  onOpenChange(false)
                }}
                className="w-full rounded-lg border p-3 text-left transition"
                style={{
                  borderColor: isSelected ? T.accent : T.surfaceBorder,
                  background: isSelected ? T.accentLight : "white",
                }}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-foreground">{summary.name}</p>
                  <RuleChip label={summary.status} color={statusToChipTone(summary.status)} />
                </div>
                <div className="mb-2 flex flex-wrap gap-1">
                  {summary.tones.map((tone) => (
                    <RuleChip key={`${summary.ruleId}-${tone}`} label={tone} color="indigo" />
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">Channels: {summary.channels.join(", ")}</p>
              </button>
            )
          })}
          {hasMore ? (
            <div ref={loadMoreRef} className="py-2 text-center text-xs text-muted-foreground">
              {isLoadingMore ? "Loading more rules..." : "Scroll to load more"}
            </div>
          ) : null}
        </div>
      </DrawerContent>
    </Drawer>
  )
}
