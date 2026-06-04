import { useParams, useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

import { AdminLayout } from "../components/admin-layout"
import { useAdminUserActions, useAdminUserDetail } from "../hooks/use-admin-users"

export default function AdminUserDetailPage() {
  const { t } = useTranslation("admin")
  const { userId } = useParams<{ userId: string }>()
  const navigate = useNavigate()
  const { data, isLoading } = useAdminUserDetail(userId)
  const { suspend, reactivate } = useAdminUserActions()

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="text-muted-foreground p-8">{t("userDetail.loading")}</div>
      </AdminLayout>
    )
  }

  if (!data?.user) {
    return (
      <AdminLayout>
        <div className="text-muted-foreground p-8">{t("userDetail.notFound")}</div>
      </AdminLayout>
    )
  }

  const { user, stats } = data
  const uid = user.userId as string

  return (
    <AdminLayout>
      <div className="mx-auto max-w-4xl space-y-6 p-6 md:p-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <Button type="button" variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => navigate("/admin/users")}>
              {t("userDetail.backToUsers")}
            </Button>
            <h1 className="text-2xl font-bold tracking-tight">{user.email}</h1>
            {user.displayName ? (
              <p className="text-muted-foreground mt-0.5 text-sm">{user.displayName}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={
                user.isSuspended
                  ? "bg-destructive/15 text-destructive rounded-full px-3 py-1 text-sm font-medium"
                  : "rounded-full bg-emerald-500/15 px-3 py-1 text-sm font-medium text-emerald-700 dark:text-emerald-400"
              }
            >
              {user.isSuspended ? t("userDetail.suspended") : t("userDetail.active")}
            </span>
            {user.role !== "ADMIN" ? (
              user.isSuspended ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={reactivate.isPending}
                  onClick={() => reactivate.mutate(uid)}
                >
                  {t("userDetail.reactivate")}
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={suspend.isPending}
                  onClick={() => suspend.mutate(uid)}
                >
                  {t("userDetail.suspend")}
                </Button>
              )
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MiniStat label={t("userDetail.rules")} value={stats.ruleCount} />
          <MiniStat label={t("userDetail.workflows")} value={stats.workflowCount} />
          <MiniStat label={t("userDetail.totalPipelines")} value={stats.pipelineCount} />
          <MiniStat label={t("userDetail.pipelinesMtd")} value={stats.pipelineThisMonth} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("userDetail.costThisMonth")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-3xl font-bold tabular-nums">
              ${Number(stats.costThisMonthUsd).toFixed(6)}
            </div>
            <div className="space-y-2">
              {Object.entries(stats.costByProvider as Record<string, number>).map(([provider, cost]) => (
                <div key={provider} className="flex justify-between text-sm">
                  <span className="text-muted-foreground capitalize">{provider}</span>
                  <span className="font-medium tabular-nums">${Number(cost).toFixed(6)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("userDetail.account")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label={t("userDetail.userId")} value={String(user.userId)} />
            <Row label={t("userDetail.role")} value={String(user.role)} />
            <Row
              label={t("userDetail.joined")}
              value={user.createdAt ? new Date(user.createdAt as string).toLocaleString() : "—"}
            />
            <Row
              label={t("userDetail.lastActive")}
              value={
                user.lastActiveAt
                  ? new Date(user.lastActiveAt as string).toLocaleString()
                  : "—"
              }
            />
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  )
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-muted-foreground text-xs font-medium">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-xl font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-xs break-all text-right">{value}</span>
    </div>
  )
}
