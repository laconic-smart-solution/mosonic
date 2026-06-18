import { useState } from "react"
import { ArrowLeft } from "lucide-react"
import { useParams, useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"
import type { ReactNode } from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
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

import { useAdminUserActions, useAdminUserDetail } from "../hooks/use-admin-users"

const panelClass = "overflow-hidden rounded-2xl border border-border bg-card"

type ConfirmAction = "suspend" | "reactivate"

function StatPill({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-background/80 px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium text-foreground">{value}</div>
    </div>
  )
}

function DetailField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
        {label}
      </div>
      <div className="text-sm leading-relaxed text-foreground">{children}</div>
    </div>
  )
}

function roleLabel(t: (key: string) => string, role: string) {
  if (role === "ADMIN") return t("users.roleAdmin")
  if (role === "CUSTOMER") return t("users.roleCustomer")
  return role
}

function formatCredits(remaining: number | null, perMonth: number | null) {
  if (remaining == null && perMonth == null) return "—"
  return `${(remaining ?? 0).toLocaleString()} / ${(perMonth ?? 0).toLocaleString()}`
}

export default function AdminUserDetailPage() {
  const { t } = useTranslation(["admin", "common"])
  const { userId } = useParams<{ userId: string }>()
  const navigate = useNavigate()
  const { data, isLoading } = useAdminUserDetail(userId)
  const { suspend, reactivate } = useAdminUserActions()
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)

  const actionPending = suspend.isPending || reactivate.isPending

  const handleConfirm = () => {
    if (!confirmAction || !userId) return
    const onSuccess = () => setConfirmAction(null)
    if (confirmAction === "suspend") {
      suspend.mutate(userId, { onSuccess })
    } else {
      reactivate.mutate(userId, { onSuccess })
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-full bg-background px-7 py-8">
        <p className="text-muted-foreground">{t("admin:userDetail.loading")}</p>
      </div>
    )
  }

  if (!data?.user) {
    return (
      <div className="min-h-full bg-background px-7 py-8">
        <p className="text-muted-foreground">{t("admin:userDetail.notFound")}</p>
      </div>
    )
  }

  const { user, stats, credits } = data as {
    user: {
      userId: string
      email?: string
      displayName?: string
      role: string
      isSuspended: boolean
      createdAt?: string
      lastActiveAt?: string | null
    }
    credits?: {
      remaining: number | null
      perMonth: number | null
      used: number | null
      planName: string | null
    }
    stats: {
      ruleCount: number
      workflowCount: number
      pipelineCount: number
      pipelineThisMonth: number
      costThisMonthUsd: number
      costByProvider: Record<string, number>
    }
  }

  const email = user.email ?? t("admin:userDetail.untitled")
  const costEntries = Object.entries(stats.costByProvider ?? {})

  return (
    <div className="min-h-full bg-background px-7 py-8 pb-20">
      <div className="mx-auto max-w-[1180px] space-y-6">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2 gap-1.5"
          onClick={() => navigate("/admin/users")}
        >
          <ArrowLeft className="size-4" />
          {t("admin:userDetail.back")}
        </Button>

        <section className={cn(panelClass, "p-6")}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-xs font-medium",
                    user.isSuspended
                      ? "bg-destructive/15 text-destructive"
                      : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
                  )}
                >
                  {user.isSuspended ? t("admin:userDetail.suspended") : t("admin:userDetail.active")}
                </span>
                <Badge variant={user.role === "ADMIN" ? "default" : "secondary"}>
                  {roleLabel((k) => t(`admin:${k}`), user.role)}
                </Badge>
              </div>
              <h1 className="mt-3 font-heading text-[26px] leading-tight tracking-tight text-foreground">
                {email}
              </h1>
              {user.displayName ? (
                <p className="mt-1 text-sm text-muted-foreground">{user.displayName}</p>
              ) : null}
            </div>

            {user.role !== "ADMIN" ? (
              <div className="flex shrink-0 gap-2">
                {user.isSuspended ? (
                  <Button
                    type="button"
                    size="sm"
                    disabled={actionPending}
                    onClick={() => setConfirmAction("reactivate")}
                  >
                    {t("admin:userDetail.reactivate")}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={actionPending}
                    onClick={() => setConfirmAction("suspend")}
                  >
                    {t("admin:userDetail.suspend")}
                  </Button>
                )}
              </div>
            ) : null}
          </div>

          <div className="mt-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            <StatPill
              label={t("admin:userDetail.creditsRemaining")}
              value={
                <span className="font-mono tabular-nums">
                  {formatCredits(credits?.remaining ?? null, credits?.perMonth ?? null)}
                </span>
              }
            />
            <StatPill
              label={t("admin:userDetail.creditsUsed")}
              value={
                <span className="font-mono tabular-nums">
                  {credits?.used != null ? credits.used.toLocaleString() : "—"}
                </span>
              }
            />
            <StatPill
              label={t("admin:userDetail.costThisMonth")}
              value={
                <span className="font-mono tabular-nums">
                  ${Number(stats.costThisMonthUsd).toFixed(4)}
                </span>
              }
            />
            <StatPill
              label={t("admin:userDetail.pipelinesMtd")}
              value={stats.pipelineThisMonth.toLocaleString()}
            />
          </div>
        </section>

        <section className={panelClass}>
          <div className="border-b border-border px-5 py-4">
            <h2 className="font-heading text-[17px] tracking-tight text-foreground">
              {t("admin:userDetail.activitySection")}
            </h2>
          </div>
          <div className="grid gap-2.5 px-5 py-5 sm:grid-cols-2 lg:grid-cols-4">
            <StatPill label={t("admin:userDetail.rules")} value={stats.ruleCount.toLocaleString()} />
            <StatPill
              label={t("admin:userDetail.workflows")}
              value={stats.workflowCount.toLocaleString()}
            />
            <StatPill
              label={t("admin:userDetail.totalPipelines")}
              value={stats.pipelineCount.toLocaleString()}
            />
            <StatPill
              label={t("admin:userDetail.pipelinesMtd")}
              value={stats.pipelineThisMonth.toLocaleString()}
            />
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className={panelClass}>
            <div className="border-b border-border px-5 py-4">
              <h2 className="font-heading text-[17px] tracking-tight text-foreground">
                {t("admin:userDetail.accountSection")}
              </h2>
            </div>
            <div className="grid gap-5 px-5 py-5 sm:grid-cols-2">
              <DetailField label={t("admin:userDetail.role")}>
                {roleLabel((k) => t(`admin:${k}`), user.role)}
              </DetailField>
              <DetailField label={t("admin:userDetail.plan")}>
                {credits?.planName ?? t("admin:userDetail.noPlan")}
              </DetailField>
              <DetailField label={t("admin:userDetail.joined")}>
                {user.createdAt ? new Date(user.createdAt).toLocaleString() : "—"}
              </DetailField>
              <DetailField label={t("admin:userDetail.lastActive")}>
                {user.lastActiveAt ? new Date(user.lastActiveAt).toLocaleString() : "—"}
              </DetailField>
            </div>
          </section>

          <section className={panelClass}>
            <div className="border-b border-border px-5 py-4">
              <h2 className="font-heading text-[17px] tracking-tight text-foreground">
                {t("admin:userDetail.costSection")}
              </h2>
            </div>
            <div className="px-5 py-5">
              <div className="mb-4 font-mono text-2xl font-semibold tabular-nums">
                ${Number(stats.costThisMonthUsd).toFixed(6)}
              </div>
              {costEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("admin:userDetail.noCost")}</p>
              ) : (
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="whitespace-normal">{t("admin:userDetail.provider")}</TableHead>
                      <TableHead className="text-right">{t("admin:userDetail.tableUsd")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {costEntries.map(([provider, cost]) => (
                      <TableRow key={provider}>
                        <TableCell className="whitespace-normal capitalize">{provider}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          ${Number(cost).toFixed(6)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </section>
        </div>
      </div>

      <AlertDialog
        open={confirmAction != null}
        onOpenChange={(open) => {
          if (!open && !actionPending) setConfirmAction(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === "suspend"
                ? t("admin:users.suspendConfirmTitle")
                : t("admin:users.reactivateConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === "suspend"
                ? t("admin:users.suspendConfirmDescription", { email })
                : t("admin:users.reactivateConfirmDescription", { email })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionPending}>
              {t("common:actions.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={actionPending}
              className={
                confirmAction === "suspend"
                  ? "bg-destructive text-white hover:bg-destructive/90"
                  : undefined
              }
              onClick={(e) => {
                e.preventDefault()
                handleConfirm()
              }}
            >
              {confirmAction === "suspend"
                ? t("admin:userDetail.suspend")
                : t("admin:userDetail.reactivate")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
