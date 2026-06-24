import { Coins } from "lucide-react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"

type Props = {
  credits: number
  size?: "sm" | "md"
  className?: string
  showLabel?: boolean
}

export function formatCreditAmount(value: number): string {
  return Math.max(0, Math.round(value)).toLocaleString()
}

export function CreditUsageBadge({
  credits,
  size = "sm",
  className,
  showLabel = false,
}: Props) {
  const { t } = useTranslation("content")
  if (credits <= 0) return null

  const formatted = formatCreditAmount(credits)
  const label = t("creditUsage.amount", { count: formatted })

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 font-medium text-primary",
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs",
        className,
      )}
      title={label}
      aria-label={label}
    >
      <Coins
        className={cn("shrink-0", size === "sm" ? "size-3" : "size-3.5")}
        aria-hidden
      />
      <span className="tabular-nums" aria-hidden>
        {formatted}
      </span>
      {showLabel ? (
        <span className="font-normal text-muted-foreground" aria-hidden>
          {t("creditUsage.creditsShort")}
        </span>
      ) : null}
    </span>
  )
}
