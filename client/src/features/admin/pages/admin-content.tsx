import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

import { useAdminContent } from "../hooks/use-admin-content"

const panelClass = "overflow-hidden rounded-2xl border border-border bg-card"

const STATUS_CLASS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  in_review: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  approved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  rejected: "bg-destructive/15 text-destructive",
}

type DatePreset = "month" | "year" | null

function toDateInputValue(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function getThisMonthRange() {
  const now = new Date()
  return {
    from: toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: toDateInputValue(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  }
}

function getThisYearRange() {
  const now = new Date()
  return {
    from: toDateInputValue(new Date(now.getFullYear(), 0, 1)),
    to: toDateInputValue(new Date(now.getFullYear(), 11, 31)),
  }
}

function statusLabel(t: (key: string) => string, status: string) {
  const keys = ["draft", "in_review", "approved", "rejected"] as const
  if ((keys as readonly string[]).includes(status)) {
    return t(`content.${status}`)
  }
  return status.replace(/_/g, " ")
}

export default function AdminContentPage() {
  const { t } = useTranslation("admin")
  const { t: tc } = useTranslation("common")
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<string | undefined>()
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [datePreset, setDatePreset] = useState<DatePreset>(null)

  const { data, isLoading } = useAdminContent({
    page,
    limit: 20,
    status,
    from: from || undefined,
    to: to || undefined,
  })

  const applyDatePreset = (preset: Exclude<DatePreset, null>) => {
    const range = preset === "month" ? getThisMonthRange() : getThisYearRange()
    setFrom(range.from)
    setTo(range.to)
    setDatePreset(preset)
    setPage(1)
  }

  return (
    <div className="min-h-full bg-background px-7 py-8 pb-20">
      <div className="mx-auto max-w-[1180px] space-y-6">
        <div>
          <h1 className="font-heading text-[26px] leading-tight tracking-tight text-foreground">
            {t("content.title")}
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">{t("content.pageSubtitle")}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant={datePreset === "month" ? "default" : "outline"}
            onClick={() => applyDatePreset("month")}
          >
            {t("content.rangeThisMonth")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={datePreset === "year" ? "default" : "outline"}
            onClick={() => applyDatePreset("year")}
          >
            {t("content.rangeThisYear")}
          </Button>
          <Input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value)
              setDatePreset(null)
              setPage(1)
            }}
            className="w-40 [color-scheme:light] dark:[color-scheme:dark]"
          />
          <Input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value)
              setDatePreset(null)
              setPage(1)
            }}
            className="w-40 [color-scheme:light] dark:[color-scheme:dark]"
          />
          <Select
            value={status ?? "all"}
            onValueChange={(value) => {
              setStatus(value === "all" ? undefined : value ?? undefined)
              setPage(1)
            }}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder={t("content.allStatuses")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("content.allStatuses")}</SelectItem>
              <SelectItem value="draft">{t("content.draft")}</SelectItem>
              <SelectItem value="in_review">{t("content.in_review")}</SelectItem>
              <SelectItem value="approved">{t("content.approved")}</SelectItem>
              <SelectItem value="rejected">{t("content.rejected")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <section className={panelClass}>
          <Table className="table-fixed min-w-[920px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[30%] whitespace-normal">
                  {t("content.tableCampaign")}
                </TableHead>
                <TableHead className="w-[18%] whitespace-normal">
                  {t("content.tableUser")}
                </TableHead>
                <TableHead className="w-[16%] whitespace-normal">
                  {t("content.tableChannels")}
                </TableHead>
                <TableHead className="w-[12%] text-center">{t("content.tableStatus")}</TableHead>
                <TableHead className="w-[12%] text-right">{t("content.tableCost")}</TableHead>
                <TableHead className="w-[12%]">{t("content.tableDate")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="whitespace-normal py-8 text-center text-muted-foreground">
                    {t("content.loading")}
                  </TableCell>
                </TableRow>
              ) : (data?.contents ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="whitespace-normal py-8 text-center text-muted-foreground">
                    {t("content.tableEmpty")}
                  </TableCell>
                </TableRow>
              ) : (
                data?.contents.map(
                  (c: {
                    contentId: string
                    userEmail: string
                    displayName?: string
                    ruleName?: string
                    preview?: string
                    channels: string[]
                    status: string
                    costUsd: number
                    createdAt: string
                  }) => (
                    <TableRow
                      key={c.contentId}
                      className="cursor-pointer"
                      onClick={() => navigate(`/admin/content/${c.contentId}`)}
                    >
                      <TableCell className="whitespace-normal align-top">
                        <div className="line-clamp-2 font-medium text-foreground">
                          {c.ruleName || t("content.untitledCampaign")}
                        </div>
                        {c.preview ? (
                          <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            {c.preview}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="whitespace-normal align-top">
                        <div className="truncate text-sm">{c.userEmail}</div>
                        {c.displayName ? (
                          <div className="truncate text-xs text-muted-foreground">{c.displayName}</div>
                        ) : null}
                      </TableCell>
                      <TableCell className="whitespace-normal align-top">
                        <div className="flex flex-wrap gap-1">
                          {(c.channels ?? []).length === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            c.channels.map((ch) => (
                              <span
                                key={ch}
                                className="rounded-md bg-muted px-2 py-0.5 text-xs capitalize text-muted-foreground"
                              >
                                {ch}
                              </span>
                            ))
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-normal text-center align-top">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                            STATUS_CLASS[c.status] ?? "bg-muted text-muted-foreground",
                          )}
                        >
                          {statusLabel(t, c.status)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums align-top">
                        ${Number(c.costUsd).toFixed(4)}
                      </TableCell>
                      <TableCell className="whitespace-normal text-muted-foreground align-top">
                        {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : "—"}
                      </TableCell>
                    </TableRow>
                  ),
                )
              )}
            </TableBody>
          </Table>
          {data ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3 text-sm">
              <span className="text-muted-foreground">
                {t("content.total", { total: data.total })}
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  {tc("actions.previous")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page >= (data.totalPages ?? 1)}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {tc("actions.next")}
                </Button>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  )
}
