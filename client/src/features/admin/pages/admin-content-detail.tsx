import { useParams, useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"
import type { ReactNode } from "react"

import { PageShell } from "@/components/app/page-shell"
import { useSetBreadcrumbLabel } from "@/components/app/breadcrumb-override.context"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

import { useAdminContentDetail } from "../hooks/use-admin-content"

const panelClass = "overflow-hidden rounded-2xl border border-border bg-card"

const STATUS_CLASS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  in_review: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  approved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  rejected: "bg-destructive/15 text-destructive",
}

function statusLabel(t: (key: string) => string, status: string) {
  const keys = ["draft", "in_review", "approved", "rejected"] as const
  if ((keys as readonly string[]).includes(status)) {
    return t(`content.${status}`)
  }
  return status.replace(/_/g, " ")
}

function formatNodeType(value?: string) {
  if (!value) return "—"
  return value.replace(/_/g, " ")
}

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

export default function AdminContentDetailPage() {
  const { t } = useTranslation(["admin", "common"])
  const { contentId } = useParams<{ contentId: string }>()
  const navigate = useNavigate()
  const { data, isLoading } = useAdminContentDetail(contentId)

  useSetBreadcrumbLabel(
    data?.ruleName?.trim() || data?.preview?.slice(0, 80) || undefined,
  )

  if (isLoading) {
    return (
      <PageShell>
        <p className="text-muted-foreground">{t("common:actions.loading")}</p>
      </PageShell>
    )
  }

  if (!data) {
    return (
      <PageShell>
        <p className="text-muted-foreground">{t("admin:contentDetail.notFound")}</p>
      </PageShell>
    )
  }

  const title =
    data.ruleName?.trim() ||
    data.preview?.slice(0, 80) ||
    t("admin:contentDetail.untitled")

  const contentPrompt = data.pipeline?.contentPrompt?.trim()

  return (
    <PageShell>
      <div className="w-full space-y-6">

        <section className={cn(panelClass, "p-6")}>
          <div className="flex flex-wrap items-start gap-3">
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-medium",
                STATUS_CLASS[data.status] ?? "bg-muted text-muted-foreground",
              )}
            >
              {statusLabel((k) => t(`admin:${k}`), data.status)}
            </span>
            {data.createdAt ? (
              <span className="text-sm text-muted-foreground">
                {t("admin:contentDetail.createdAt", {
                  date: new Date(data.createdAt).toLocaleString(),
                })}
              </span>
            ) : null}
          </div>

          <h1 className="mt-3 font-heading text-[26px] leading-tight tracking-tight text-foreground">
            {title}
          </h1>

          <div className="mt-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            <StatPill
              label={t("admin:contentDetail.totalCost")}
              value={
                <span className="font-mono tabular-nums">
                  ${Number(data.costUsd).toFixed(4)}
                </span>
              }
            />
            <StatPill
              label={t("admin:contentDetail.pipelineStatusLabel")}
              value={
                <span className="capitalize">{data.pipeline?.status ?? "—"}</span>
              }
            />
            <StatPill
              label={t("admin:contentDetail.startedAt")}
              value={
                data.pipeline?.startedAt
                  ? new Date(data.pipeline.startedAt).toLocaleString()
                  : "—"
              }
            />
            <StatPill
              label={t("admin:contentDetail.user")}
              value={
                data.user ? (
                  <button
                    type="button"
                    className="truncate text-left transition-colors hover:text-primary"
                    onClick={() => navigate(`/admin/users/${data.user!.userId}`)}
                  >
                    {data.user.displayName || data.user.email}
                  </button>
                ) : (
                  "—"
                )
              }
            />
          </div>
        </section>

        {(data.preview || contentPrompt) && (
          <section className={panelClass}>
            <div className="border-b border-border px-5 py-4">
              <h2 className="font-heading text-[17px] tracking-tight text-foreground">
                {t("admin:contentDetail.contentSection")}
              </h2>
            </div>
            <div className="space-y-5 px-5 py-5">
              {contentPrompt ? (
                <DetailField label={t("admin:contentDetail.contentPrompt")}>
                  <p className="text-muted-foreground">{contentPrompt}</p>
                </DetailField>
              ) : null}
              {data.preview ? (
                <DetailField label={t("admin:contentDetail.generatedPreview")}>
                  <p className="whitespace-pre-wrap text-muted-foreground">{data.preview}</p>
                </DetailField>
              ) : null}
            </div>
          </section>
        )}

        {data.user ? (
          <section className={panelClass}>
            <div className="border-b border-border px-5 py-4">
              <h2 className="font-heading text-[17px] tracking-tight text-foreground">
                {t("admin:contentDetail.ownerSection")}
              </h2>
            </div>
            <div className="grid gap-5 px-5 py-5 sm:grid-cols-2">
              <DetailField label={t("admin:contentDetail.user")}>
                <button
                  type="button"
                  className="text-left font-medium transition-colors hover:text-primary"
                  onClick={() => navigate(`/admin/users/${data.user!.userId}`)}
                >
                  {data.user.displayName || data.user.email}
                </button>
              </DetailField>
              {data.user.email && data.user.displayName ? (
                <DetailField label={t("admin:contentDetail.userEmail")}>
                  <span className="text-muted-foreground">{data.user.email}</span>
                </DetailField>
              ) : null}
            </div>
          </section>
        ) : null}

        <section className={panelClass}>
          <div className="border-b border-border px-5 py-4">
            <h2 className="font-heading text-[17px] tracking-tight text-foreground">
              {t("admin:contentDetail.costBreakdown")}
            </h2>
          </div>
          <Table className="table-fixed min-w-[520px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[34%] whitespace-normal">
                  {t("admin:contentDetail.tableNode")}
                </TableHead>
                <TableHead className="w-[42%] whitespace-normal">
                  {t("admin:contentDetail.tableModel")}
                </TableHead>
                <TableHead className="w-[24%] text-right">
                  {t("admin:contentDetail.tableUsd")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.costBreakdown.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="whitespace-normal py-8 text-center text-muted-foreground"
                  >
                    {t("admin:contentDetail.emptyBreakdown")}
                  </TableCell>
                </TableRow>
              ) : (
                data.costBreakdown.map(
                  (row: { nodeType?: string; model?: string; costUsd: number }, i: number) => (
                    <TableRow key={`${row.nodeType}-${row.model}-${i}`}>
                      <TableCell className="whitespace-normal align-top capitalize">
                        {formatNodeType(row.nodeType)}
                      </TableCell>
                      <TableCell className="whitespace-normal align-top">
                        {row.model ?? "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums align-top">
                        ${Number(row.costUsd).toFixed(4)}
                      </TableCell>
                    </TableRow>
                  ),
                )
              )}
            </TableBody>
          </Table>
        </section>
      </div>
    </PageShell>
  )
}
