import { useState } from "react"
import { Send } from "lucide-react"
import { useTranslation } from "react-i18next"

import { PageShell } from "@/components/app/page-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { AdminLineSendDialog } from "../components/admin-line-send-dialog"
import {
  useAdminLineConnections,
  type AdminLineConnection,
} from "../hooks/use-admin-line"

const panelClass = "overflow-hidden rounded-2xl border border-border bg-card"
const PAGE_SIZE = 20

function formatConnectedAt(iso: string, locale: string) {
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export default function AdminLinePage() {
  const { t, i18n } = useTranslation("admin")
  const { t: tc } = useTranslation("common")
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<AdminLineConnection | null>(null)

  const query = useAdminLineConnections({
    page,
    limit: PAGE_SIZE,
    search: search.trim() || undefined,
  })

  const connections = query.data?.connections ?? []
  const total = query.data?.total ?? 0
  const totalPages = Math.max(1, query.data?.totalPages ?? 1)

  const openSend = (row: AdminLineConnection) => {
    setSelected(row)
  }

  return (
    <PageShell>
      <div className="w-full space-y-6">
        <div>
          <h1 className="font-heading text-[26px] leading-tight tracking-tight text-foreground">
            {t("communication.line.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("communication.line.subtitle")}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Input
            placeholder={t("communication.line.searchPlaceholder")}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            className="max-w-xs"
          />
        </div>

        <section className={panelClass}>
          <Table className="table-fixed min-w-[920px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[34%] whitespace-normal">
                  {t("communication.line.columns.user")}
                </TableHead>
                <TableHead className="w-[34%] whitespace-normal">
                  {t("communication.line.columns.email")}
                </TableHead>
                <TableHead className="w-[18%] whitespace-normal">
                  {t("communication.line.columns.connectedAt")}
                </TableHead>
                <TableHead className="w-[140px] text-right">
                  {t("communication.line.columns.actions")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.isLoading ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="whitespace-normal py-10 text-center text-muted-foreground"
                  >
                    {t("communication.line.loading")}
                  </TableCell>
                </TableRow>
              ) : query.isError ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="whitespace-normal py-10 text-center text-destructive"
                  >
                    {t("communication.line.loadError")}
                  </TableCell>
                </TableRow>
              ) : connections.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="whitespace-normal py-10 text-center text-muted-foreground"
                  >
                    {t("communication.line.empty")}
                  </TableCell>
                </TableRow>
              ) : (
                connections.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-normal align-top">
                      <div className="truncate font-medium">{row.displayName}</div>
                      {row.username ? (
                        <div className="truncate text-xs text-muted-foreground">
                          @{row.username}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="whitespace-normal align-top text-muted-foreground">
                      {row.email ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-normal align-top text-muted-foreground">
                      {formatConnectedAt(row.connectedAt, i18n.language)}
                    </TableCell>
                    <TableCell className="align-top text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => openSend(row)}
                      >
                        <Send className="size-3.5" />
                        {t("communication.line.send")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </section>

        {query.data ? (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>
              {t("communication.line.showing", {
                start: connections.length ? (page - 1) * PAGE_SIZE + 1 : 0,
                end: Math.min(page * PAGE_SIZE, total),
                total,
              })}
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                {tc("pagination.previous")}
              </Button>
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

      <AdminLineSendDialog
        target={selected}
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
      />
    </PageShell>
  )
}
