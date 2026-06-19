import { useState } from "react"
import { Pencil, Users } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

import {
  useAdminPlanCreate,
  useAdminPlanUpdate,
  useAdminPlanUsers,
  useAdminPlans,
} from "../hooks/use-admin-plans"
import { useAdminCreditConfig } from "../hooks/use-admin-credit"

type PlanRow = {
  planId: string
  name: string
  priceThb: number
  priceUsd: number
  creditsPerMonth: number
  creditsOverride?: number | null
  isActive: boolean
  description?: string
  features?: string[]
  activeUsers?: number
}

export default function AdminPlansPage() {
  const { t } = useTranslation("admin")
  const { data: plans = [] } = useAdminPlans()
  const { data: creditConfig } = useAdminCreditConfig()
  const createPlan = useAdminPlanCreate()
  const updatePlan = useAdminPlanUpdate()

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editing, setEditing] = useState<PlanRow | null>(null)
  const [usersPlanId, setUsersPlanId] = useState<string | null>(null)
  const [usersPlanName, setUsersPlanName] = useState("")

  const [form, setForm] = useState({
    name: "",
    priceThb: "1200",
    priceUsd: "35",
    creditsOverride: "",
    description: "",
    features: "",
    isActive: true,
  })

  const { data: planUsers } = useAdminPlanUsers(usersPlanId ?? undefined)

  const hasOverride = form.creditsOverride.trim() !== ""
  const computedCredits = hasOverride
    ? Math.floor(Number(form.creditsOverride))
    : Math.floor(Number(form.priceUsd) / (creditConfig?.creditPriceUsd ?? 0.01))

  const openCreate = () => {
    setEditing(null)
    setForm({
      name: "",
      priceThb: "1200",
      priceUsd: "35",
      creditsOverride: "",
      description: "",
      features: "",
      isActive: true,
    })
    setDrawerOpen(true)
  }

  const openEdit = (plan: PlanRow) => {
    setEditing(plan)
    setForm({
      name: plan.name,
      priceThb: String(plan.priceThb),
      priceUsd: String(plan.priceUsd),
      creditsOverride:
        plan.creditsOverride != null ? String(plan.creditsOverride) : "",
      description: plan.description ?? "",
      features: (plan.features ?? []).join("\n"),
      isActive: plan.isActive,
    })
    setDrawerOpen(true)
  }

  const openUsers = (plan: PlanRow) => {
    setUsersPlanId(plan.planId)
    setUsersPlanName(plan.name)
  }

  const handleSave = () => {
    const body: Record<string, unknown> = {
      name: form.name,
      priceThb: Number(form.priceThb),
      priceUsd: Number(form.priceUsd),
      description: form.description || undefined,
      features: form.features
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      isActive: form.isActive,
    }
    if (hasOverride && Number.isFinite(Number(form.creditsOverride))) {
      body.creditsOverride = Math.max(0, Math.floor(Number(form.creditsOverride)))
    }
    if (editing) {
      updatePlan.mutate({ planId: editing.planId, body }, { onSuccess: () => setDrawerOpen(false) })
    } else {
      createPlan.mutate(body, { onSuccess: () => setDrawerOpen(false) })
    }
  }

  const planRows = plans as PlanRow[]

  return (
    <div className="min-h-full bg-background px-7 py-8 pb-20">
      <div className="mx-auto max-w-[1180px] space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-[26px] leading-tight tracking-tight text-foreground">
              {t("plans.title")}
            </h1>
            <p className="mt-1 text-[13px] text-muted-foreground">{t("plans.pageSubtitle")}</p>
          </div>
          <Button type="button" className="h-[38px] rounded-[9px] text-[13px]" onClick={openCreate}>
            {t("plans.create")}
          </Button>
        </div>

        <section className="overflow-hidden rounded-2xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("plans.colPlan")}</TableHead>
                <TableHead>{t("plans.colStatus")}</TableHead>
                <TableHead className="text-right">{t("plans.colPriceThb")}</TableHead>
                <TableHead className="text-right">{t("plans.colPriceUsd")}</TableHead>
                <TableHead className="text-right">{t("plans.colCredits")}</TableHead>
                <TableHead className="text-right">{t("plans.colActiveUsers")}</TableHead>
                <TableHead className="w-[120px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {planRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    {t("plans.empty")}
                  </TableCell>
                </TableRow>
              ) : (
                planRows.map((plan) => (
                  <TableRow key={plan.planId}>
                    <TableCell>
                      <div className="font-medium text-foreground">{plan.name}</div>
                      {plan.description ? (
                        <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                          {plan.description}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant={plan.isActive ? "default" : "secondary"}>
                        {plan.isActive ? t("plans.active") : t("plans.inactive")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      ฿{plan.priceThb.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      ${plan.priceUsd.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {plan.creditsPerMonth.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {plan.activeUsers ?? 0}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label={t("plans.edit")}
                          onClick={() => openEdit(plan)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label={t("plans.viewUsers")}
                          onClick={() => openUsers(plan)}
                        >
                          <Users className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </section>
      </div>

      {drawerOpen ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
          <div className="flex h-full w-full max-w-md flex-col gap-4 overflow-y-auto border-l border-border bg-background p-6 shadow-xl">
            <h2 className="text-lg font-semibold">
              {editing ? t("plans.editPlan") : t("plans.createPlan")}
            </h2>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>{t("plans.fieldName")}</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{t("plans.fieldPriceThb")}</Label>
                  <Input
                    type="number"
                    value={form.priceThb}
                    onChange={(e) => setForm((f) => ({ ...f, priceThb: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{t("plans.fieldPriceUsd")}</Label>
                  <Input
                    type="number"
                    value={form.priceUsd}
                    onChange={(e) => setForm((f) => ({ ...f, priceUsd: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>{t("plans.fieldCreditsOverride")}</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.creditsOverride}
                  placeholder={t("plans.creditsOverridePlaceholder")}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, creditsOverride: e.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {t("plans.creditsOverrideHint")}
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                {hasOverride
                  ? t("plans.overrideCreditsHint")
                  : t("plans.computedCreditsHint")}
              </p>
              <p className="text-sm font-semibold tabular-nums">
                {t("plans.computedCredits", { count: computedCredits.toLocaleString() })}
              </p>
              <div className="space-y-1">
                <Label>{t("plans.fieldDescription")}</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={2}
                />
              </div>
              <div className="space-y-1">
                <Label>{t("plans.fieldFeatures")}</Label>
                <Textarea
                  value={form.features}
                  onChange={(e) => setForm((f) => ({ ...f, features: e.target.value }))}
                  rows={4}
                  placeholder={t("plans.featuresPlaceholder")}
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.isActive}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
                />
                <Label>{t("plans.fieldActive")}</Label>
              </div>
            </div>
            <div className="mt-auto flex gap-2">
              <Button
                type="button"
                onClick={handleSave}
                disabled={createPlan.isPending || updatePlan.isPending}
              >
                {t("plans.save")}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setDrawerOpen(false)}>
                {t("credit.cancel")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <Dialog
        open={usersPlanId != null}
        onOpenChange={(open) => {
          if (!open) {
            setUsersPlanId(null)
            setUsersPlanName("")
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("plans.usersTitle", { name: usersPlanName })}</DialogTitle>
          </DialogHeader>
          <ul className="max-h-64 space-y-2 overflow-y-auto">
            {(planUsers?.users ?? []).length === 0 ? (
              <li className="py-4 text-center text-sm text-muted-foreground">{t("plans.noUsers")}</li>
            ) : (
              planUsers?.users.map(
                (u: { userId: string; email?: string; creditsRemaining: number }) => (
                  <li
                    key={u.userId}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm",
                    )}
                  >
                    <span className="truncate">{u.email ?? u.userId}</span>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                      {Math.floor(u.creditsRemaining).toLocaleString()} {t("plans.remaining")}
                    </span>
                  </li>
                ),
              )
            )}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  )
}
