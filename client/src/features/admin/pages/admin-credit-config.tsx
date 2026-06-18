import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import {
  ArrowDown,
  ArrowUp,
  History,
  Percent,
  Plus,
  Receipt,
  RefreshCw,
  Save,
  TrendingUp,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

import {
  useAdminCreditConfig,
  useAdminCreditConfigUpdate,
  useAdminCreditHistory,
  useAdminCreditRecalculate,
  useAdminFixedCostMutations,
  useAdminFixedCosts,
} from "../hooks/use-admin-credit"

type HistoryRow = {
  changedAt: string
  creditPriceUsd: number
  marginTarget: number
  changedBy: string
}

const panelClass =
  "flex flex-col overflow-hidden rounded-2xl border border-border bg-card"

function DerivedStat({
  icon,
  iconClass,
  label,
  value,
  valueClass,
}: {
  icon: ReactNode
  iconClass: string
  label: string
  value: ReactNode
  valueClass?: string
}) {
  return (
    <div className="flex min-w-[150px] flex-1 items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <div
        className={cn(
          "flex size-[34px] shrink-0 items-center justify-center rounded-[9px] text-base",
          iconClass,
        )}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
          {label}
        </div>
        <div
          className={cn(
            "mt-0.5 font-mono text-base font-medium tabular-nums text-foreground",
            valueClass,
          )}
        >
          {value}
        </div>
      </div>
    </div>
  )
}

function formatPriceDelta(current: number, previous: number | undefined) {
  if (previous == null || previous === 0 || current === previous) return null
  const pct = Math.round(((current - previous) / previous) * 100)
  if (pct === 0) return null
  return pct
}

function truncateId(value: string, max = 18) {
  if (value.length <= max) return value
  return `${value.slice(0, 10)}…${value.slice(-2)}`
}

export default function AdminCreditConfigPage() {
  const { t } = useTranslation("admin")
  const { data: config } = useAdminCreditConfig()
  const { data: fixedCosts = [] } = useAdminFixedCosts()
  const [historyPage, setHistoryPage] = useState(1)
  const [historyEntries, setHistoryEntries] = useState<HistoryRow[]>([])
  const { data: history } = useAdminCreditHistory(historyPage)
  const update = useAdminCreditConfigUpdate()
  const recalc = useAdminCreditRecalculate()
  const fixedMut = useAdminFixedCostMutations()

  const [creditPrice, setCreditPrice] = useState("0.01")
  const [marginTarget, setMarginTarget] = useState("3")
  const [basicUsers, setBasicUsers] = useState("50")
  const [newFixedName, setNewFixedName] = useState("")
  const [newFixedAmount, setNewFixedAmount] = useState("")
  const [formDirty, setFormDirty] = useState(false)
  const lastSyncedConfigRef = useRef<string>("")

  const serverCreditPrice = config?.creditPriceUsd
  const serverMarginTarget = config?.marginTarget
  const serverBasicUsers = config?.basicUsersPerMonth

  useEffect(() => {
    if (
      serverCreditPrice == null ||
      serverMarginTarget == null ||
      serverBasicUsers == null
    ) {
      return
    }
    const fingerprint = `${serverCreditPrice}|${serverMarginTarget}|${serverBasicUsers}`
    if (formDirty) return
    if (lastSyncedConfigRef.current === fingerprint) return
    lastSyncedConfigRef.current = fingerprint
    setCreditPrice(String(serverCreditPrice))
    setMarginTarget(String(serverMarginTarget))
    setBasicUsers(String(serverBasicUsers))
  }, [serverCreditPrice, serverMarginTarget, serverBasicUsers, formDirty])

  const creditsPerDollar = useMemo(() => {
    const p = Number(creditPrice) || 0.01
    return Math.round(1 / p)
  }, [creditPrice])

  const activeFixedCosts = useMemo(
    () =>
      (fixedCosts as Array<{
        fixedCostId: string
        name: string
        amountUsd: number
        isActive: boolean
      }>).filter((row) => row.isActive !== false),
    [fixedCosts],
  )

  const totalFixedUsd = useMemo(
    () => activeFixedCosts.reduce((sum, row) => sum + row.amountUsd, 0),
    [activeFixedCosts],
  )

  useEffect(() => {
    if (!history?.entries) return
    const rows = history.entries as HistoryRow[]
    setHistoryEntries((prev) => {
      if (historyPage === 1) return rows
      const seen = new Set(prev.map((row) => row.changedAt))
      return [...prev, ...rows.filter((row) => !seen.has(row.changedAt))]
    })
  }, [history, historyPage])

  const derivedMargin = Number(config?.derivedMargin ?? 0)
  const marginIsLow = derivedMargin > 0 && derivedMargin < 1

  const handleSaveConfig = () => {
    const creditPriceUsd = Number(creditPrice)
    const margin = Number(marginTarget)
    const basicUsersPerMonth = Number(basicUsers)
    if (
      !Number.isFinite(creditPriceUsd) ||
      creditPriceUsd <= 0 ||
      !Number.isFinite(margin) ||
      margin <= 0 ||
      !Number.isFinite(basicUsersPerMonth) ||
      basicUsersPerMonth < 1
    ) {
      toast.error(t("credit.invalidConfig"))
      return
    }
    update.mutate(
      { creditPriceUsd, marginTarget: margin, basicUsersPerMonth },
      {
        onSuccess: () => {
          setFormDirty(false)
          lastSyncedConfigRef.current = `${creditPriceUsd}|${margin}|${basicUsersPerMonth}`
          toast.success(t("credit.saved"))
        },
        onError: () => toast.error(t("credit.saveFailed")),
      },
    )
  }

  const handleAddFixed = () => {
    const name = newFixedName.trim()
    const amountUsd = Number(newFixedAmount)
    if (!name || !Number.isFinite(amountUsd)) return
    fixedMut.create.mutate(
      { name, amountUsd },
      {
        onSuccess: () => {
          setNewFixedName("")
          setNewFixedAmount("")
        },
      },
    )
  }

  return (
    <div className="min-h-full bg-background px-7 py-8 pb-20">
      <div className="mx-auto max-w-[1180px] space-y-[18px]">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-[26px] leading-tight tracking-tight text-foreground">
              {t("credit.title")}
            </h1>
            <p className="mt-1 text-[13px] text-muted-foreground">{t("credit.pageSubtitle")}</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-[38px] rounded-[9px] text-[13px]"
              disabled={recalc.isPending}
              onClick={() => recalc.mutate()}
            >
              <RefreshCw className="size-4" />
              {t("credit.recalculateOverhead")}
            </Button>
            <Button
              type="button"
              className="h-[38px] rounded-[9px] text-[13px]"
              disabled={update.isPending}
              onClick={handleSaveConfig}
            >
              <Save className="size-4" />
              {t("credit.save")}
            </Button>
          </div>
        </div>

        {/* Hero rate card */}
        <div className="relative flex flex-wrap items-center gap-8 overflow-hidden rounded-[18px] bg-linear-to-br from-teal-900 via-teal-700 to-teal-500 px-7 py-[26px] dark:from-teal-950 dark:via-teal-800 dark:to-teal-400">
          <div className="pointer-events-none absolute -top-[60px] -right-[60px] size-[240px] rounded-full bg-teal-300/25 dark:bg-teal-400/20" />
          <div className="relative z-1 shrink-0">
            <div className="mb-1.5 text-[10px] font-semibold tracking-[0.12em] text-white/50 uppercase">
              {t("credit.rateBannerLabel")}
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-heading text-[38px] tracking-tight text-white">
                {creditsPerDollar.toLocaleString()}
              </span>
              <span className="text-sm text-white/55">{t("credit.creditsLabel")} =</span>
              <span className="font-mono text-lg font-medium text-teal-100 dark:text-teal-200">
                $1.00
              </span>
            </div>
          </div>
          <div className="relative z-1 hidden h-12 w-px shrink-0 bg-white/12 sm:block" />
          <div className="relative z-1 grid flex-1 grid-cols-1 gap-6 sm:grid-cols-3">
            <HeroField
              id="creditPrice"
              label={t("credit.creditPriceUsd")}
              value={creditPrice}
              onChange={(v) => {
                setFormDirty(true)
                setCreditPrice(v)
              }}
              step="0.001"
            />
            <HeroField
              id="margin"
              label={t("credit.marginTarget")}
              value={marginTarget}
              onChange={(v) => {
                setFormDirty(true)
                setMarginTarget(v)
              }}
              step="0.1"
              min="0.01"
            />
            <HeroField
              id="basicUsers"
              label={t("credit.basicUsers")}
              value={basicUsers}
              onChange={(v) => {
                setFormDirty(true)
                setBasicUsers(v)
              }}
              min="1"
              step="1"
            />
          </div>
        </div>

        {/* Derived stats */}
        <div className="flex flex-wrap gap-2.5">
          <DerivedStat
            icon={<Percent className="size-4" />}
            iconClass="bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-200"
            label={t("credit.overheadFactor")}
            value={Number(config?.overheadFactor ?? 0).toFixed(4)}
          />
          <DerivedStat
            icon={<TrendingUp className="size-4" />}
            iconClass="bg-amber-50 text-amber-700 dark:bg-amber-950/70 dark:text-amber-400"
            label={t("credit.derivedMargin")}
            value={derivedMargin.toFixed(4)}
            valueClass={marginIsLow ? "text-amber-700 dark:text-amber-400" : undefined}
          />
          <DerivedStat
            icon={<Receipt className="size-4" />}
            iconClass="bg-teal-50 text-teal-700 dark:bg-teal-950/70 dark:text-teal-400"
            label={t("credit.fixedCostsTitle")}
            value={
              <>
                ${totalFixedUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                <span className="ml-0.5 text-[11px] font-normal text-muted-foreground">/mo</span>
              </>
            }
          />
        </div>

        {/* Fixed costs */}
        <section className={panelClass}>
            <div className="border-b border-border px-5 pt-[18px] pb-3.5">
              <h2 className="flex items-center gap-2 font-heading text-[17px] tracking-tight text-foreground">
                <Receipt className="size-4 text-muted-foreground" />
                {t("credit.fixedCostsTitle")}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">{t("credit.fixedCostsHint")}</p>
            </div>
            <div className="px-2 pt-2">
              {activeFixedCosts.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {t("credit.emptyFixedCosts")}
                </p>
              ) : (
                activeFixedCosts.map((row) => (
                  <div
                    key={row.fixedCostId}
                    className="group flex items-center justify-between rounded-[9px] px-3 py-[11px] transition-colors hover:bg-muted/60"
                  >
                    <span className="flex-1 text-[13px] font-medium text-foreground">{row.name}</span>
                    <span className="mr-3.5 font-mono text-[13px] text-muted-foreground tabular-nums">
                      ${row.amountUsd.toFixed(2)}
                    </span>
                    <button
                      type="button"
                      className="text-[11px] font-medium text-destructive opacity-0 transition-opacity group-hover:opacity-100 hover:underline"
                      onClick={() => fixedMut.remove.mutate(row.fixedCostId)}
                    >
                      {t("credit.remove")}
                    </button>
                  </div>
                ))
              )}
            </div>
            <div className="mt-1 flex items-end gap-2 border-t border-border px-3 py-3.5">
              <div className="min-w-0 flex-1">
                <label className="mb-1.5 block text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                  {t("credit.fixedCostName")}
                </label>
                <Input
                  placeholder={t("credit.fixedCostNamePlaceholder")}
                  value={newFixedName}
                  onChange={(e) => setNewFixedName(e.target.value)}
                  className="h-9 rounded-lg text-[13px]"
                />
              </div>
              <div className="w-[110px] shrink-0">
                <label className="mb-1.5 block text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                  {t("credit.fixedCostAmount")}
                </label>
                <Input
                  type="number"
                  placeholder="0.00"
                  value={newFixedAmount}
                  onChange={(e) => setNewFixedAmount(e.target.value)}
                  className="h-9 rounded-lg text-[13px]"
                />
              </div>
              <Button
                type="button"
                size="sm"
                className="h-9 shrink-0 gap-1.5 rounded-lg px-3.5 text-xs whitespace-nowrap"
                onClick={handleAddFixed}
              >
                <Plus className="size-3.5" />
                {t("credit.addCost")}
              </Button>
            </div>
            <div className="mt-auto flex items-center justify-between border-t border-border bg-muted/50 px-5 py-3.5">
              <span className="text-xs font-medium text-muted-foreground">{t("credit.totalMonthlyFixed")}</span>
              <span className="font-mono text-[15px] font-semibold text-foreground tabular-nums">
                ${totalFixedUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </section>

        {/* History */}
        <section className={panelClass}>
          <div className="border-b border-border px-5 pt-[18px] pb-3.5">
            <h2 className="flex items-center gap-2 font-heading text-[17px] tracking-tight text-foreground">
              <History className="size-4 text-muted-foreground" />
              {t("credit.historyTitle")}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">{t("credit.historySubtitle")}</p>
          </div>
          {historyEntries.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              {t("credit.emptyHistory")}
            </p>
          ) : (
            <>
              <div className="grid grid-cols-[170px_110px_90px_1fr] gap-3 border-b border-border bg-muted/50 px-5 py-2.5 text-[10px] font-semibold tracking-[0.07em] text-muted-foreground uppercase max-lg:hidden">
                <span>{t("credit.colDate")}</span>
                <span>{t("credit.creditPriceUsd")}</span>
                <span>{t("credit.marginTarget")}</span>
                <span>{t("credit.colChangedBy")}</span>
              </div>
              {historyEntries.map((row, i) => {
                const older = historyEntries[i + 1]
                const delta = formatPriceDelta(row.creditPriceUsd, older?.creditPriceUsd)
                const isSystem = row.changedBy.includes("bootstrap") || row.changedBy === "system"
                return (
                  <div
                    key={`${row.changedAt}-${i}`}
                    className="grid grid-cols-1 gap-1 border-b border-border/60 px-5 py-3 transition-colors last:border-b-0 hover:bg-muted/60 sm:grid-cols-[170px_110px_90px_1fr] sm:items-center sm:gap-3"
                  >
                    <span className="font-mono text-xs text-muted-foreground">
                      {new Date(row.changedAt).toLocaleString()}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[13px] font-medium text-foreground tabular-nums">
                        ${Number(row.creditPriceUsd).toFixed(4)}
                      </span>
                      {delta != null ? (
                        <span
                          className={cn(
                            "inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-semibold",
                            delta > 0
                              ? "bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-400"
                              : "bg-green-50 text-green-600 dark:bg-green-950/60 dark:text-green-400",
                          )}
                        >
                          {delta > 0 ? (
                            <ArrowUp className="size-2.5" />
                          ) : (
                            <ArrowDown className="size-2.5" />
                          )}
                          {Math.abs(delta)}%
                        </span>
                      ) : null}
                    </div>
                    <span className="font-mono text-[12.5px] text-muted-foreground tabular-nums">
                      {row.marginTarget}
                    </span>
                    <span
                      className={cn(
                        "truncate font-mono text-[11px]",
                        isSystem ? "font-medium text-primary" : "text-muted-foreground",
                      )}
                      title={row.changedBy}
                    >
                      {isSystem ? row.changedBy : truncateId(row.changedBy)}
                    </span>
                  </div>
                )
              })}
            </>
          )}
          {(history?.totalPages ?? 1) > historyPage ? (
            <div className="border-t border-border px-5 py-3 text-center">
              <button
                type="button"
                className="text-xs font-medium text-primary hover:underline"
                onClick={() => setHistoryPage((p) => p + 1)}
              >
                {t("credit.showMoreHistory")}
              </button>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  )
}

function HeroField({
  id,
  label,
  value,
  onChange,
  step,
  min,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  step?: string
  min?: string
}) {
  return (
    <div className="min-w-[130px] flex-1">
      <label htmlFor={id} className="mb-1.5 block text-[11px] text-white/50">
        {label}
      </label>
      <input
        id={id}
        type="number"
        step={step}
        min={min}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-white/20 bg-white/10 px-2.5 py-2 font-mono text-sm text-white outline-none transition-colors placeholder:text-white/30 focus:border-teal-300 focus:bg-white/15 dark:border-white/25 dark:bg-white/10 dark:focus:border-teal-400 dark:focus:bg-white/15"
      />
    </div>
  )
}
