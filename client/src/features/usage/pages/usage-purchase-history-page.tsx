import { useState } from "react"
import { useTranslation } from "react-i18next"

import { usagePanelClass } from "@/features/usage/components/usage-plan-banner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { usePurchaseHistoryQuery } from "@/shared/queries/usage.query"
import type { PurchaseHistoryEntry } from "@/shared/types/usage.type"

function formatAmount(amount: number, currencyCode: string): string {
  const symbol = currencyCode === "THB" ? "฿" : currencyCode === "USD" ? "$" : `${currencyCode} `
  return `${symbol}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// CreditTopupPurchaseStatus / PlanPurchaseStatus: pending | active | cancelled.
function statusBadgeClass(status: string): string {
  switch (status) {
    case "active":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
    case "pending":
      return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
    case "cancelled":
      return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400"
    default:
      return ""
  }
}

function statusLabel(status: string, t: (key: string) => string): string {
  switch (status) {
    case "active":
      return t("purchaseHistory.statusActive")
    case "pending":
      return t("purchaseHistory.statusPending")
    case "cancelled":
      return t("purchaseHistory.statusCancelled")
    default:
      return status
  }
}

export default function UsagePurchaseHistoryPage() {
  const { t } = useTranslation("usage")
  const { t: tc } = useTranslation("common")
  const [page, setPage] = useState(1)

  const history = usePurchaseHistoryQuery({ page, limit: 20 })
  const entries: PurchaseHistoryEntry[] = history.data?.entries ?? []

  return (
    <div className="flex flex-col gap-6" role="tabpanel" aria-label={t("tabs.history")}>
      <section className={usagePanelClass}>
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-heading text-[17px] tracking-tight text-foreground">
            {t("purchaseHistory.title")}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("purchaseHistory.subtitle")}
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t("purchaseHistory.date")}</TableHead>
              <TableHead>{t("purchaseHistory.type")}</TableHead>
              <TableHead>{t("purchaseHistory.item")}</TableHead>
              <TableHead className="text-right">{t("purchaseHistory.credits")}</TableHead>
              <TableHead className="text-right">{t("purchaseHistory.amount")}</TableHead>
              <TableHead>{t("purchaseHistory.status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  {tc("actions.loading")}
                </TableCell>
              </TableRow>
            ) : entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  {t("purchaseHistory.empty")}
                </TableCell>
              </TableRow>
            ) : (
              entries.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {new Date(row.purchaseDate).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {row.type === "topup"
                        ? t("purchaseHistory.typeTopup")
                        : t("purchaseHistory.typePlan")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{row.label}</TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums text-muted-foreground">
                    {row.credits != null ? row.credits.toLocaleString() : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm font-medium tabular-nums text-foreground">
                    {formatAmount(row.amount, row.currencyCode)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn(statusBadgeClass(row.status))}>
                      {statusLabel(row.status, t)}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <div className="flex justify-center gap-2 border-t border-border p-4">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            {tc("actions.back")}
          </Button>
          <span className="self-center text-sm text-muted-foreground">
            {page} / {history.data?.totalPages ?? 1}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={page >= (history.data?.totalPages ?? 1)}
            onClick={() => setPage((p) => p + 1)}
          >
            {tc("actions.next")}
          </Button>
        </div>
      </section>
    </div>
  )
}
