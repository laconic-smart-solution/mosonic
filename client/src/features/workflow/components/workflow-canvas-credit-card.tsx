import { useState } from "react"
import { Coins, Loader2, X } from "lucide-react"
import { useTranslation } from "react-i18next"

import { formatCreditAmount } from "@/components/core/credit-usage-badge"
import { cn } from "@/lib/utils"
import type { PipelineEstimateResponse } from "@/shared/types/pipeline.type"

type WorkflowCanvasCreditCardProps = {
  estimate: PipelineEstimateResponse | undefined
  loading?: boolean
  error?: boolean
  stale?: boolean
  className?: string
  /** Start with the panel expanded. Default true. */
  defaultOpen?: boolean
}

export function WorkflowCanvasCreditCard({
  estimate,
  loading = false,
  error = false,
  stale = false,
  className,
  defaultOpen = true,
}: WorkflowCanvasCreditCardProps) {
  const { t } = useTranslation("workflow")
  const { t: tCredit } = useTranslation("credit")
  const [open, setOpen] = useState(defaultOpen)

  const total = estimate?.totalCredits ?? 0
  const remaining = estimate?.creditsRemaining
  const sufficient = estimate?.sufficient ?? true
  const breakdown = estimate?.breakdown ?? []
  const totalLabel = formatCreditAmount(total)

  return (
    <div className={cn("flex flex-col items-end gap-2", className)}>
      {open ? (
        <div className="w-[240px] rounded-2xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur">
          <div className="flex items-start gap-2">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Coins className="size-4" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium text-muted-foreground">
                {t("canvasCredit.title")}
              </p>
              {loading ? (
                <p className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  {t("canvasCredit.calculating")}
                </p>
              ) : error ? (
                <p className="mt-0.5 text-sm font-semibold text-destructive">
                  {t("canvasCredit.error")}
                </p>
              ) : (
                <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
                  {t("canvasCredit.total", { count: totalLabel })}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={t("canvasCredit.hide")}
              title={t("canvasCredit.hide")}
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>

          {!loading && !error && remaining != null ? (
            <p
              className={cn(
                "mt-2 text-[11px] tabular-nums",
                sufficient ? "text-muted-foreground" : "text-destructive",
              )}
            >
              {t("canvasCredit.balance", {
                count: formatCreditAmount(remaining),
              })}
            </p>
          ) : null}

          {stale ? (
            <p className="mt-1.5 text-[10px] leading-snug text-amber-700 dark:text-amber-400">
              {t("canvasCredit.staleHint")}
            </p>
          ) : null}

          {!loading && !error && breakdown.length > 0 ? (
            <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto border-t border-border pt-2">
              {breakdown.map((item) => (
                <li
                  key={item.nodeType}
                  className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground"
                >
                  <span className="min-w-0 truncate">
                    {tCredit(`nodeType.${item.nodeType}`, {
                      defaultValue: item.nodeType,
                    })}
                    {item.count > 1 ? ` ×${item.count}` : ""}
                  </span>
                  <span className="shrink-0 tabular-nums flex items-center gap-1 font-medium text-foreground">
                    {formatCreditAmount(item.creditsTotal)} <Coins className="size-3.5 text-primary" aria-hidden />
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {!loading && !error && total === 0 && breakdown.length === 0 ? (
            <p className="mt-2 text-[11px] text-muted-foreground">
              {t("canvasCredit.free")}
            </p>
          ) : null}
        </div>
      ) : null}

      {
        !open && (<button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "relative flex size-10 items-center justify-center rounded-full border border-border bg-card shadow-md transition-colors",
            "hover:bg-muted/80",
            open ? "text-primary ring-2 ring-primary/25" : "text-foreground",
          )}
          aria-expanded={open}
          aria-label={
            open ? t("canvasCredit.hide") : t("canvasCredit.show")
          }
          title={open ? t("canvasCredit.hide") : t("canvasCredit.show")}
        >
          <Coins className="size-4" aria-hidden />
          {!open && !loading && !error && total > 0 ? (
            <span className="absolute -top-1 -right-1 max-w-[2.5rem] truncate rounded-full bg-primary px-1 py-px text-[9px] font-semibold tabular-nums text-primary-foreground">
              {totalLabel}
            </span>
          ) : null}
          {!open && loading ? (
            <span className="absolute -top-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full bg-card">
              <Loader2 className="size-3 animate-spin text-muted-foreground" />
            </span>
          ) : null}
        </button>)
      }
    </div>
  )
}
