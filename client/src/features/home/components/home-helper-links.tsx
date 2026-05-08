import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import type { RuleListItem } from "@/shared/services/rule.service"
import { useState } from "react"

type HomeHelperLinksProps = {
  rules: RuleListItem[]
  selectedRuleLabel?: string
  isLoadingRules: boolean
  isLoadingMore: boolean
  canViewMore: boolean
  onNavigateSetup: () => void
  onSelectRule: (ruleId: string) => void
  onViewMore: () => void
}

export function HomeHelperLinks({
  rules,
  selectedRuleLabel,
  isLoadingRules,
  isLoadingMore,
  canViewMore,
  onNavigateSetup,
  onSelectRule,
  onViewMore,
}: HomeHelperLinksProps) {


  const [isOpen, setIsOpen] = useState(false)
  const handleOpenChange = (open: boolean) => {
    setIsOpen(open)
  }


  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        className="h-8 rounded-full px-4 text-xs"
        onClick={onNavigateSetup}
      >
        Set up rule
      </Button>

      <Popover open={isOpen} onOpenChange={handleOpenChange}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="secondary"
              className="h-8 max-w-[260px] rounded-full px-4 text-xs"
              title={selectedRuleLabel ? `Selected rule: ${selectedRuleLabel}` : "Select rule"}
            >
              <span className="truncate">
                {selectedRuleLabel ? `Rule: ${selectedRuleLabel}` : "Select rule"}
              </span>
            </Button>
          }
        />
        <PopoverContent className="w-[360px] p-3">
          <PopoverHeader className="mb-1">
            <PopoverTitle className="text-sm">Saved rules</PopoverTitle>
          </PopoverHeader>

          <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
            {isLoadingRules ? (
              <p className="text-xs text-muted-foreground">Loading rules...</p>
            ) : rules.length === 0 ? (
              <p className="text-xs text-muted-foreground">No rules found.</p>
            ) : (
              rules.map((rule) => (
                <button
                  key={rule.ruleId}
                  type="button"
                  onClick={() => {
                    onSelectRule(rule.ruleId)
                    setIsOpen(false)
                  }}
                  className="w-full rounded-lg border border-border bg-background p-2 text-left transition hover:border-primary/40 hover:bg-muted/30"
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-semibold text-foreground">{rule.name}</p>
                    <span className="text-[10px] uppercase text-muted-foreground">{rule.status}</span>
                  </div>
                  <p className="truncate text-[11px] text-muted-foreground">
                    Tones: {rule.tones.join(", ") || "-"}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    Channels: {rule.channels.join(", ") || "-"}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Updated: {new Date(rule.updatedAt).toLocaleDateString()}
                  </p>
                </button>
              ))
            )}
          </div>
          {canViewMore ? (
            <div className="mt-2">
              <Button
                type="button"
                variant="ghost"
                className="h-8 w-full text-xs"
                onClick={onViewMore}
                disabled={isLoadingMore}
              >
                {isLoadingMore ? "Loading..." : "View more"}
              </Button>
            </div>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  )
}
