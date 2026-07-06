import { Check, Loader2 } from "lucide-react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"
import type { CreditPackage } from "@/shared/types/credit.type"

function formatThb(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

type TopupPackagePickerProps = {
  packages: CreditPackage[]
  selectedId: string | null
  onSelect: (id: string) => void
  layout?: "grid" | "compact"
  disabled?: boolean
}

export function TopupPackagePicker({
  packages,
  selectedId,
  onSelect,
  layout = "grid",
  disabled = false,
}: TopupPackagePickerProps) {
  const { t } = useTranslation("credit")

  return (
    <div
      role="radiogroup"
      aria-label={t("topup.title")}
      className={cn(
        "grid gap-3",
        layout === "grid" ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-3",
      )}
    >
      {packages.map((pkg) => {
        const selected = pkg.id === selectedId
        const label = t("topup.packageAriaLabel", {
          label: pkg.label,
          credits: pkg.credits.toLocaleString(),
          price: formatThb(pkg.priceThb),
          defaultValue: `${pkg.label}, ${pkg.credits.toLocaleString()} credits, ฿${formatThb(pkg.priceThb)}`,
        })
        return (
          <button
            key={pkg.id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            disabled={disabled}
            onClick={() => onSelect(pkg.id)}
            className={cn(
              "relative flex flex-col items-start gap-1 rounded-2xl border p-4 text-left transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
              "disabled:pointer-events-none disabled:opacity-50",
              selected
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/40 hover:bg-muted/50",
            )}
          >
            {selected ? (
              <span className="absolute top-3 right-3 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Check className="size-3" aria-hidden />
              </span>
            ) : null}
            <span className="font-mono text-xs font-medium text-muted-foreground">
              {pkg.id}
            </span>
            <span className="text-xs font-medium text-muted-foreground">{pkg.label}</span>
            <span className="font-heading text-2xl font-semibold tabular-nums">
              {pkg.credits.toLocaleString()}
            </span>
            <span className="text-sm text-muted-foreground tabular-nums">
              {t("topup.credits")} · ฿{formatThb(pkg.priceThb)}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              ${pkg.priceUsd.toFixed(2)} USD
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function TopupAwaitingPayment() {
  const { t } = useTranslation("credit")

  return (
    <div
      className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-muted/30 px-4 py-8 text-center"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
      <p className="text-sm font-medium text-foreground">{t("topup.paymentWindowHint")}</p>
      <p className="text-xs text-muted-foreground">{t("topup.balanceUpdatesAutomatically")}</p>
    </div>
  )
}
