import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { T } from "@/lib/tokens"
import { useCostBudgetQuery, useCostBudgetUpdateMutation } from "@/shared/queries/cost.query"

export function BudgetSettingsForm() {
  const { t } = useTranslation("cost")
  const { data: settings, isLoading } = useCostBudgetQuery()
  const mutation = useCostBudgetUpdateMutation()

  const [form, setForm] = useState({
    monthlyLimitUsd: "" as string | number,
    warningThresholdPct: 80,
    onMonthlyLimitHit: "warn" as "warn" | "stop",
    perRunLimitUsd: "" as string | number,
    onRunLimitHit: "stop" as "warn" | "stop",
    emailAlerts: true,
    inAppAlerts: true,
  })

  useEffect(() => {
    if (!settings) return
    setForm({
      monthlyLimitUsd: settings.monthlyLimitUsd ?? "",
      warningThresholdPct: settings.warningThresholdPct ?? 80,
      onMonthlyLimitHit: settings.onMonthlyLimitHit ?? "warn",
      perRunLimitUsd: settings.perRunLimitUsd ?? "",
      onRunLimitHit: settings.onRunLimitHit ?? "stop",
      emailAlerts: settings.emailAlerts ?? true,
      inAppAlerts: settings.inAppAlerts ?? true,
    })
  }, [settings])

  if (isLoading && !settings) {
    return (
      <div className="rounded-[10px] border p-6 text-sm" style={{ borderColor: T.surfaceBorder }}>
        {t("budget.loading")}
      </div>
    )
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    mutation.mutate({
      monthlyLimitUsd:
        form.monthlyLimitUsd === "" ? undefined : Number(form.monthlyLimitUsd),
      perRunLimitUsd: form.perRunLimitUsd === "" ? undefined : Number(form.perRunLimitUsd),
      warningThresholdPct: Number(form.warningThresholdPct),
      onMonthlyLimitHit: form.onMonthlyLimitHit,
      onRunLimitHit: form.onRunLimitHit,
      emailAlerts: form.emailAlerts,
      inAppAlerts: form.inAppAlerts,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <section
        className="rounded-[10px] border p-5"
        style={{ background: T.surfaceBg, borderColor: T.surfaceBorder }}
      >
        <h3 className="mb-4 text-sm font-semibold" style={{ color: T.textPrimary }}>
          {t("budget.monthlyLimitSection")}
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="monthlyLimit">{t("budget.monthlyLimitLabel")}</Label>
            <Input
              id="monthlyLimit"
              type="number"
              min={0}
              step="0.01"
              placeholder="e.g. 50"
              value={form.monthlyLimitUsd}
              onChange={(e) => setForm((f) => ({ ...f, monthlyLimitUsd: e.target.value }))}
            />
            <p className="text-[11px]" style={{ color: T.textMuted }}>
              {t("budget.monthlyLimitHint")}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="warnPct">{t("budget.warnAtLabel")}</Label>
            <Input
              id="warnPct"
              type="number"
              min={1}
              max={99}
              value={form.warningThresholdPct}
              onChange={(e) =>
                setForm((f) => ({ ...f, warningThresholdPct: Number(e.target.value) }))
              }
            />
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <Label>{t("budget.whenMonthlyHit")}</Label>
          <div className="flex gap-2">
            {(["warn", "stop"] as const).map((opt) => (
              <Button
                key={opt}
                type="button"
                variant={form.onMonthlyLimitHit === opt ? "default" : "outline"}
                className="flex-1"
                onClick={() => setForm((f) => ({ ...f, onMonthlyLimitHit: opt }))}
              >
                {opt === "warn" ? t("budget.warnOnly") : t("budget.stopPipeline")}
              </Button>
            ))}
          </div>
        </div>
      </section>

      <section
        className="rounded-[10px] border p-5"
        style={{ background: T.surfaceBg, borderColor: T.surfaceBorder }}
      >
        <h3 className="mb-4 text-sm font-semibold" style={{ color: T.textPrimary }}>
          {t("budget.perRunSection")}
        </h3>
        <div className="space-y-1.5">
          <Label htmlFor="perRun">{t("budget.perRunLabel")}</Label>
          <Input
            id="perRun"
            type="number"
            min={0}
            step="0.01"
            placeholder="e.g. 2.00"
            value={form.perRunLimitUsd}
            onChange={(e) => setForm((f) => ({ ...f, perRunLimitUsd: e.target.value }))}
          />
          <p className="text-[11px]" style={{ color: T.textMuted }}>
            {t("budget.perRunHint")}
          </p>
        </div>
        <div className="mt-4 space-y-2">
          <Label>{t("budget.whenRunHit")}</Label>
          <div className="flex gap-2">
            {(["warn", "stop"] as const).map((opt) => (
              <Button
                key={opt}
                type="button"
                variant={form.onRunLimitHit === opt ? "default" : "outline"}
                className="flex-1"
                onClick={() => setForm((f) => ({ ...f, onRunLimitHit: opt }))}
              >
                {opt === "warn" ? t("budget.warnOnly") : t("budget.stopPipeline")}
              </Button>
            ))}
          </div>
        </div>
      </section>

      <section
        className="rounded-[10px] border p-5"
        style={{ background: T.surfaceBg, borderColor: T.surfaceBorder }}
      >
        <h3 className="mb-4 text-sm font-semibold" style={{ color: T.textPrimary }}>
          {t("budget.notificationsSection")}
        </h3>
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="emailAlerts">{t("budget.emailAlerts")}</Label>
            <Switch
              id="emailAlerts"
              checked={form.emailAlerts}
              onCheckedChange={(v) => setForm((f) => ({ ...f, emailAlerts: v }))}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="inAppAlerts">{t("budget.inAppAlerts")}</Label>
            <Switch
              id="inAppAlerts"
              checked={form.inAppAlerts}
              onCheckedChange={(v) => setForm((f) => ({ ...f, inAppAlerts: v }))}
            />
          </div>
        </div>
      </section>

      <Button type="submit" disabled={mutation.isPending} className="w-full">
        {mutation.isPending ? t("budget.saving") : t("budget.save")}
      </Button>
      {mutation.isSuccess ? (
        <p className="text-center text-sm" style={{ color: T.green }}>
          {t("budget.saved")}
        </p>
      ) : null}
      {mutation.isError ? (
        <p className="text-center text-sm" style={{ color: T.red }}>
          {t("budget.saveFailed")}
        </p>
      ) : null}
    </form>
  )
}
