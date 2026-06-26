import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import type { RuleListItem } from "@/shared/services/rule.service"

type HomeHelperLinksProps = {
  rules: RuleListItem[]
  showRuleSelector?: boolean
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
  showRuleSelector = true,
  selectedRuleLabel,
  isLoadingRules,
  isLoadingMore,
  canViewMore,
  onNavigateSetup,
  onSelectRule,
  onViewMore,
}: HomeHelperLinksProps) {
  const { t } = useTranslation("home")
  const [isOpen, setIsOpen] = useState(false)
  const handleOpenChange = (open: boolean) => {
    setIsOpen(open)
  }


  return (
    <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-center">
      <Button
        type="button"
        variant="outline"
        className="h-9 w-full rounded-full px-4 text-xs sm:h-8 sm:w-auto"
        onClick={onNavigateSetup}
      >
        {t("helper.setupRule")}
      </Button>

      {!isLoadingRules && showRuleSelector && rules.length > 0 ? (
        <Popover open={isOpen} onOpenChange={handleOpenChange}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="secondary"
              className="h-9 w-full max-w-none rounded-full px-4 text-xs sm:h-8 sm:max-w-[260px] sm:w-auto"
              title={
                selectedRuleLabel
                  ? t("helper.selectedRule", { name: selectedRuleLabel })
                  : t("helper.selectRule")
              }
            >
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
                    <p className="truncate text-xs font-semibold text-foreground">{rule.name}</p>
                    <span className="text-[10px] uppercase text-muted-foreground">{rule.status}</span>
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
        </PopoverContent>
      </Popover>
      ) : null}
    </div>
  )
}
