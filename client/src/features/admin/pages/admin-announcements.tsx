import { useState } from "react"
import { Megaphone, Plus } from "lucide-react"
import { useTranslation } from "react-i18next"

import { PageShell } from "@/components/app/page-shell"
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

import { AdminAnnouncementPublishDialog } from "../components/admin-announcement-publish-dialog"
import {
  useAdminAnnouncements,
  type AnnouncementLevel,
} from "../hooks/use-admin-announcements"

const panelClass = "overflow-hidden rounded-2xl border border-border bg-card"
const PAGE_SIZE = 20

function formatPublishedAt(iso: string, locale: string) {
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function levelBadgeClass(level: AnnouncementLevel) {
  if (level === "critical") {
    return "border-destructive/30 bg-destructive/10 text-destructive"
  }
  if (level === "warning") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
  }
  return "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400"
}

export default function AdminAnnouncementsPage() {
  const { t, i18n } = useTranslation("admin")
  const { t: tc } = useTranslation("common")
  const [page, setPage] = useState(1)
  const [publishOpen, setPublishOpen] = useState(false)

  const query = useAdminAnnouncements({ page, limit: PAGE_SIZE })
  const announcements = query.data?.announcements ?? []
  const total = query.data?.total ?? 0
  const totalPages = Math.max(1, query.data?.totalPages ?? 1)
  const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const end = Math.min(page * PAGE_SIZE, total)

  return (
    <PageShell>
      <div className="w-full space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-[26px] leading-tight tracking-tight text-foreground">
              {t("communication.announcements.title")}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("communication.announcements.subtitle")}
            </p>
          </div>
          <Button type="button" onClick={() => setPublishOpen(true)}>
            <Plus className="size-4" aria-hidden />
            {t("communication.announcements.publish")}
          </Button>
        </div>

        <section className={panelClass}>
          <Table className="table-fixed min-w-[960px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[22%]">
                  {t("communication.announcements.columns.title")}
                </TableHead>
                <TableHead className="w-[28%]">
                  {t("communication.announcements.columns.message")}
                </TableHead>
                <TableHead className="w-[10%]">
                  {t("communication.announcements.columns.level")}
                </TableHead>
                <TableHead className="w-[12%]">
                  {t("communication.announcements.columns.channels")}
                </TableHead>
                <TableHead className="w-[10%]">
                  {t("communication.announcements.columns.status")}
                </TableHead>
                <TableHead className="w-[18%]">
                  {t("communication.announcements.columns.publishedAt")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                    {t("communication.announcements.loading")}
                  </TableCell>
                </TableRow>
              ) : query.isError ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-sm text-destructive">
                    {t("communication.announcements.loadError")}
                  </TableCell>
                </TableRow>
              ) : announcements.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center">
                    <div className="mx-auto flex max-w-sm flex-col items-center gap-2 text-muted-foreground">
                      <Megaphone className="size-8 opacity-40" aria-hidden />
                      <p className="text-sm">
                        {t("communication.announcements.empty")}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                announcements.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="align-top font-medium whitespace-normal">
                      {row.title}
                    </TableCell>
                    <TableCell className="align-top whitespace-normal text-muted-foreground">
                      <span className="line-clamp-2">{row.message}</span>
                    </TableCell>
                    <TableCell className="align-top">
                      <Badge
                        variant="outline"
                        className={cn("capitalize", levelBadgeClass(row.level))}
                      >
                        {t(`communication.announcements.levels.${row.level}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="flex flex-wrap gap-1">
                        {row.sendInApp ? (
                          <Badge variant="secondary" className="font-normal">
                            {t("communication.announcements.channelInAppShort")}
                            {row.inAppRecipientCount > 0
                              ? ` · ${row.inAppRecipientCount}`
                              : ""}
                          </Badge>
                        ) : null}
                        {row.sendLine ? (
                          <Badge variant="secondary" className="font-normal">
                            {t("communication.announcements.channelLineShort")}
                            {row.lineSent != null
                              ? ` · ${row.lineSent}/${row.lineTotal ?? 0}`
                              : ""}
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <Badge
                        variant="outline"
                        className={cn(
                          "capitalize",
                          row.status === "failed"
                            ? "border-destructive/30 bg-destructive/10 text-destructive"
                            : "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                        )}
                      >
                        {t(`communication.announcements.status.${row.status}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="align-top text-muted-foreground">
                      {formatPublishedAt(row.publishedAt, i18n.language)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </section>

        {total > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>
              {t("communication.announcements.showing", { start, end, total })}
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                {tc("pagination.previous")}
              </Button>
              <span>
                {page} / {totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                {tc("pagination.next")}
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <AdminAnnouncementPublishDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
      />
    </PageShell>
  )
}
