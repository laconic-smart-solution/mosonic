import { Coins } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { T } from "@/lib/tokens"
import { cn } from "@/lib/utils"
import { useUsageSummaryQuery, useCreditBalanceSocketRefresh } from "@/shared/queries/usage.query"

function formatCredits(value: number): string {
  return Math.round(value).toLocaleString()
}

type TopbarCreditBalanceProps = {
  className?: string
  alwaysShowCount?: boolean
}

export function TopbarCreditBalance({
  className,
  alwaysShowCount = false,
}: TopbarCreditBalanceProps = {}) {
  const { t } = useTranslation("common")
  useCreditBalanceSocketRefresh()
  const { data, isLoading, isError } = useUsageSummaryQuery()

  const creditsRemaining = data?.creditsRemaining ?? 0
  const creditsPerMonth = data?.creditsPerMonth ?? 0
  const lowBalance =
    creditsPerMonth > 0 && creditsRemaining / creditsPerMonth < 0.1

  const label = isLoading
    ? t("credits.loading")
    : isError
      ? t("credits.unavailable")
      : t("credits.remaining", { count: formatCredits(creditsRemaining) })

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            to="/usage/topup"
            className={cn(
              "flex h-8 shrink-0 items-center gap-1.5 rounded-md border bg-card px-2.5 text-xs font-medium tabular-nums transition-colors outline-none hover:bg-muted",
              "focus-visible:ring-2 focus-visible:ring-ring/25",
              lowBalance && "border-amber-500/40 text-amber-600 dark:text-amber-400",
              className,
            )}
            style={
              lowBalance
                ? undefined
                : { borderColor: T.surfaceBorder, color: T.textPrimary }
            }
            aria-label={label}
          />
        }
      >
        <Coins
          className={cn(
            "size-3.5 shrink-0",
            lowBalance ? "text-amber-500" : "text-primary",
          )}
          aria-hidden
        />
        <span className={alwaysShowCount ? "inline" : "hidden sm:inline"}>
          {isLoading ? "…" : isError ? "—" : formatCredits(creditsRemaining)}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p>{label}</p>
        <p className="text-muted-foreground">{t("credits.viewUsage")}</p>
      </TooltipContent>
    </Tooltip>
  )
}
