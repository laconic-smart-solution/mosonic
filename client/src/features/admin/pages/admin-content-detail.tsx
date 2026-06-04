import { useParams, useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import { AdminLayout } from "../components/admin-layout"
import { useAdminContentDetail } from "../hooks/use-admin-content"

export default function AdminContentDetailPage() {
  const { t } = useTranslation(["admin", "common"])
  const { contentId } = useParams<{ contentId: string }>()
  const navigate = useNavigate()
  const { data, isLoading } = useAdminContentDetail(contentId)

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="text-muted-foreground p-8">{t("common:actions.loading")}</div>
      </AdminLayout>
    )
  }

  if (!data?.content) {
    return (
      <AdminLayout>
        <div className="text-muted-foreground p-8">{t("admin:contentDetail.notFound")}</div>
      </AdminLayout>
    )
  }

  const { content, user, pipeline, costUsd, costBreakdown } = data

  return (
    <AdminLayout>
      <div className="mx-auto max-w-4xl space-y-6 p-6 md:p-8">
        <Button type="button" variant="ghost" size="sm" className="-ml-2" onClick={() => navigate("/admin/content")}>
          {t("admin:contentDetail.back")}
        </Button>

        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t("admin:contentDetail.title", { id: content.contentId })}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {t("admin:contentDetail.status", { status: content.status })}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{t("admin:contentDetail.user")}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {user ? (
                <>
                  <div className="font-medium">{user.email}</div>
                  {user.displayName ? (
                    <div className="text-muted-foreground">{user.displayName}</div>
                  ) : null}
                  <div className="text-muted-foreground mt-2 font-mono text-xs">{user.userId}</div>
                </>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{t("admin:contentDetail.pipeline")}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {pipeline ? (
                <>
                  <div className="font-mono text-xs">{pipeline.pipelineId}</div>
                  <div className="text-muted-foreground mt-1">
                    {t("admin:contentDetail.pipelineStatus", { status: pipeline.status })}
                  </div>
                </>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("admin:contentDetail.totalCost")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">${Number(costUsd).toFixed(6)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("admin:contentDetail.costBreakdown")}</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("admin:contentDetail.tableNode")}</TableHead>
                  <TableHead>{t("admin:contentDetail.tableModel")}</TableHead>
                  <TableHead className="text-right">{t("admin:contentDetail.tableUsd")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {costBreakdown.map(
                  (row: { nodeType?: string; model?: string; costUsd: number }, i: number) => (
                    <TableRow key={`${row.nodeType}-${i}`}>
                      <TableCell className="font-mono text-xs">{row.nodeType ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{row.model ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">${Number(row.costUsd).toFixed(6)}</TableCell>
                    </TableRow>
                  ),
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  )
}
