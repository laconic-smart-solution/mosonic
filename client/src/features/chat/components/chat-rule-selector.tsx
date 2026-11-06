import { useState } from "react"
import { useTranslation } from "react-i18next"
import { LayoutGrid, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import type { RuleListItem } from "@/shared/services/rule.service"

type ChatRuleSelectorProps = {
  rules: RuleListItem[]
  selectedRuleLabel?: string
  isLoadingRules: boolean
  isLoadingMore: boolean
  canViewMore: boolean
  onSelectRule: (ruleId: string) => void
  onViewMore: () => void
  /** Creates an Untitled brand and enters it. */
  onNewBrand: () => void
  /** Returns to the Welcome brand list (clears the active brand). */
  onLeaveBrand?: () => void
}

function initials(name?: string): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean)
  return (parts.slice(0, 2).map((p) => p[0]).join("") || "?").toUpperCase()
}

/**
 * Brand avatar. TODO: show the brand's logo asset once the rules list returns a logo URL —
 * today only per-rule asset queries expose it, too costly for the whole dropdown.
 */
function BrandAvatar({ name, size = "md" }: { name?: string; size?: "sm" | "md" }) {
  return (
    <span
      aria-hidden
      className={
        (size === "sm" ? "size-6 text-[10px] " : "size-8 text-xs ") +
        "flex shrink-0 items-center justify-center rounded-[8px] bg-[#C9A27E] font-semibold text-white dark:bg-teal-400/20 dark:text-teal-300"
      }
    >
      {initials(name)}
    </span>
  )
}

/** Promoted from the old home page's inline rule-picker popover — same behavior. */
export function ChatRuleSelector({
  rules,
  selectedRuleLabel,
  isLoadingRules,
  isLoadingMore,
  canViewMore,
  onSelectRule,
  onViewMore,
  onNewBrand,
  onLeaveBrand,
}: ChatRuleSelectorProps) {
  const { t } = useTranslation("home")
  const { t: tChat } = useTranslation("chat")
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="flex items-center gap-2">
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="outline"
              className="h-9 max-w-[280px] gap-2 rounded-[10px] border-canvas-200 bg-white pr-3 pl-1.5 text-[13px] font-semibold text-navy-700 dark:border-white/8 dark:bg-navy-700 dark:text-[#E8EDF6]"
              title={
                selectedRuleLabel
                  ? t("helper.selectedRule", { name: selectedRuleLabel })
                  : t("helper.selectRule")
              }
            >
              {selectedRuleLabel ? <BrandAvatar name={selectedRuleLabel} size="sm" /> : null}
              <span className="truncate">
                {selectedRuleLabel
                  ? t("helper.rulePrefix", { name: selectedRuleLabel })
                  : t("helper.selectRule")}
              </span>
            </Button>
          }
        />
        <PopoverContent className="w-[min(360px,calc(100vw-2rem))] p-3">
          <PopoverHeader className="mb-1">
            <PopoverTitle className="text-sm">{t("helper.savedRules")}</PopoverTitle>
          </PopoverHeader>

          <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
            {isLoadingRules ? (
              <p className="text-xs text-muted-foreground">{t("helper.loadingRules")}</p>
            ) : rules.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("helper.noRules")}</p>
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
                    <span className="flex min-w-0 items-center gap-2">
                      <BrandAvatar name={rule.name} size="sm" />
                      <p className="truncate text-xs font-semibold text-foreground">{rule.name}</p>
                    </span>
                    <span className="text-[10px] uppercase text-muted-foreground">
                      {rule.status}
                    </span>
                  </div>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {t("helper.tones", { value: rule.tones.join(", ") || "-" })}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {t("helper.channels", { value: rule.channels.join(", ") || "-" })}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {t("helper.updated", {
                      date: new Date(rule.updatedAt).toLocaleDateString(),
                    })}
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
                {isLoadingMore ? t("helper.loadingMore") : t("helper.viewMore")}
              </Button>
            </div>
          ) : null}
          <div className="mt-2 space-y-1 border-t border-border pt-2">
            {onLeaveBrand ? (
              <Button
                type="button"
                variant="ghost"
                className="h-8 w-full justify-start rounded-[9px] text-xs font-medium"
                onClick={() => {
                  setIsOpen(false)
                  onLeaveBrand()
                }}
              >
                <LayoutGrid data-icon="inline-start" />
                {tChat("ruleSelector.allBrands")}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              className="h-8 w-full justify-start rounded-[9px] text-xs font-medium"
              onClick={() => {
                setIsOpen(false)
                onNewBrand()
              }}
            >
              <Plus data-icon="inline-start" />
              {tChat("ruleSelector.newBrand")}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
