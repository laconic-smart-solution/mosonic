import { useState } from "react"
import { Pencil, Plus } from "lucide-react"
import { useTranslation } from "react-i18next"

import { PageShell } from "@/components/app/page-shell"
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
import { cn } from "@/lib/utils"
import { toastApiError } from "@/shared/lib/toast-error"

import {
  useAdminTopupPlanActive,
  useAdminTopupPlanCreate,
  useAdminTopupPlanUpdate,
  useAdminTopupPlans,
  type TopupPlan,
} from "../hooks/use-admin-topup-plans"

const panelClass = "overflow-hidden rounded-2xl border border-border bg-card"

type FormState = {
  code: string
  label: string
  credits: string
  priceUsd: string
  priceThb: string
  sortOrder: string
  active: boolean
}

const emptyForm = (): FormState => ({
  code: "",
  label: "",
  credits: "1000",
  priceUsd: "10",
  priceThb: "350",
  sortOrder: "0",
  active: true,
})

function planToForm(plan: TopupPlan): FormState {
  return {
    code: plan.code,
    label: plan.label,
    credits: String(plan.credits),
    priceUsd: String(plan.priceUsd),
    priceThb: String(plan.priceThb),
    sortOrder: String(plan.sortOrder),
    active: plan.active,
  }
}

export default function AdminTopupPlansPage() {
  const { t } = useTranslation("admin")
  const { t: tc } = useTranslation("common")
  const { data: plans = [], isLoading, isError } = useAdminTopupPlans()
  const createPlan = useAdminTopupPlanCreate()
  const updatePlan = useAdminTopupPlanUpdate()
  const setActive = useAdminTopupPlanActive()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<TopupPlan | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm())
    setDialogOpen(true)
  }

  const openEdit = (plan: TopupPlan) => {
    setEditing(plan)
    setForm(planToForm(plan))
    setDialogOpen(true)
  }

  const submit = () => {
    const body = {
      label: form.label.trim(),
      credits: Number(form.credits),
      priceUsd: Number(form.priceUsd),
      priceThb: Number(form.priceThb),
      sortOrder: Number(form.sortOrder),
      active: form.active,
    }

    if (editing) {
      updatePlan.mutate(
        { code: editing.code, body },
        {
          onSuccess: () => setDialogOpen(false),
          onError: (error) => toastApiError(error, "admin:topupPlans.saveError"),
        },
      )
      return
    }

    createPlan.mutate(
      { ...body, code: form.code.trim().toLowerCase() },
      {
        onSuccess: () => setDialogOpen(false),
        onError: (error) => toastApiError(error, "admin:topupPlans.saveError"),
      },
    )
  }

  const toggleActive = (plan: TopupPlan) => {
    setActive.mutate(
      { code: plan.code, active: !plan.active },
      { onError: (error) => toastApiError(error, "admin:topupPlans.saveError") },
    )
  }

  const saving = createPlan.isPending || updatePlan.isPending

  return (
    <PageShell>
      <div className="w-full space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-[26px] leading-tight tracking-tight text-foreground">
              {t("topupPlans.title")}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("topupPlans.subtitle")}</p>
          </div>
          <Button type="button" onClick={openCreate}>
            <Plus className="size-4" aria-hidden />
            {t("topupPlans.create")}
          </Button>
        </div>

        <div className={cn(panelClass, "p-4")}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("topupPlans.columns.code")}</TableHead>
                <TableHead>{t("topupPlans.columns.label")}</TableHead>
                <TableHead>{t("topupPlans.columns.credits")}</TableHead>
                <TableHead>{t("topupPlans.columns.priceUsd")}</TableHead>
                <TableHead>{t("topupPlans.columns.priceThb")}</TableHead>
                <TableHead>{t("topupPlans.columns.sortOrder")}</TableHead>
                <TableHead>{t("topupPlans.columns.status")}</TableHead>
                <TableHead className="w-[120px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-muted-foreground">
                    {tc("actions.loading")}
                  </TableCell>
                </TableRow>
              ) : isError ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-destructive">
                    {t("topupPlans.loadError")}
                  </TableCell>
                </TableRow>
              ) : plans.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-muted-foreground">
                    {t("topupPlans.empty")}
                  </TableCell>
                </TableRow>
              ) : (
                plans.map((plan) => (
                  <TableRow key={plan.code}>
                    <TableCell className="font-mono text-sm">{plan.code}</TableCell>
                    <TableCell className="font-medium">{plan.label}</TableCell>
                    <TableCell>{plan.credits.toLocaleString()}</TableCell>
                    <TableCell>${Number(plan.priceUsd).toFixed(2)}</TableCell>
                    <TableCell>฿{Number(plan.priceThb).toLocaleString()}</TableCell>
                    <TableCell>{plan.sortOrder}</TableCell>
                    <TableCell>
                      <Badge variant={plan.active ? "default" : "secondary"}>
                        {plan.active ? t("topupPlans.active") : t("topupPlans.inactive")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openEdit(plan)}
                        >
                          <Pencil className="size-3.5" aria-hidden />
                          {t("topupPlans.edit")}
                        </Button>
                        <Switch
                          checked={plan.active}
                          onCheckedChange={() => toggleActive(plan)}
                          aria-label={t("topupPlans.toggleActive", { code: plan.code })}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? t("topupPlans.editTitle") : t("topupPlans.createTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {!editing ? (
              <div className="grid gap-2">
                <Label htmlFor="topup-code">{t("topupPlans.fields.code")}</Label>
                <Input
                  id="topup-code"
                  value={form.code}
                  onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))}
                  placeholder="starter"
                />
              </div>
            ) : null}
            <div className="grid gap-2">
              <Label htmlFor="topup-label">{t("topupPlans.fields.label")}</Label>
              <Input
                id="topup-label"
                value={form.label}
                onChange={(e) => setForm((prev) => ({ ...prev, label: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="topup-credits">{t("topupPlans.fields.credits")}</Label>
                <Input
                  id="topup-credits"
                  type="number"
                  min={1}
                  value={form.credits}
                  onChange={(e) => setForm((prev) => ({ ...prev, credits: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="topup-sort">{t("topupPlans.fields.sortOrder")}</Label>
                <Input
                  id="topup-sort"
                  type="number"
                  min={0}
                  value={form.sortOrder}
                  onChange={(e) => setForm((prev) => ({ ...prev, sortOrder: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="topup-usd">{t("topupPlans.fields.priceUsd")}</Label>
                <Input
                  id="topup-usd"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.priceUsd}
                  onChange={(e) => setForm((prev) => ({ ...prev, priceUsd: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="topup-thb">{t("topupPlans.fields.priceThb")}</Label>
                <Input
                  id="topup-thb"
                  type="number"
                  min={0.01}
                  step="0.01"
                  value={form.priceThb}
                  onChange={(e) => setForm((prev) => ({ ...prev, priceThb: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
              <Label htmlFor="topup-active">{t("topupPlans.fields.active")}</Label>
              <Switch
                id="topup-active"
                checked={form.active}
                onCheckedChange={(checked) => setForm((prev) => ({ ...prev, active: checked }))}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              {tc("actions.cancel")}
            </Button>
            <Button type="button" onClick={submit} disabled={saving}>
              {tc("actions.save")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageShell>
  )
}
