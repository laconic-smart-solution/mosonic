import { useState } from "react"
import { useNavigate } from "react-router-dom"

import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import { AdminLayout } from "../components/admin-layout"
import { useAdminContent } from "../hooks/use-admin-content"

const STATUS_CLASS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  approved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  rejected: "bg-destructive/15 text-destructive",
}

export default function AdminContentPage() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<string | undefined>()
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")

  const { data, isLoading } = useAdminContent({
    page,
    limit: 20,
    status,
    from: from || undefined,
    to: to || undefined,
  })

  return (
    <AdminLayout>
      <div className="space-y-6 p-6 md:p-8">
        <h1 className="text-2xl font-bold tracking-tight">Content monitor</h1>

        <div className="flex flex-wrap gap-3">
          <select
            value={status ?? ""}
            onChange={(e) => {
              setStatus(e.target.value || undefined)
              setPage(1)
            }}
            className="border-input bg-background h-9 rounded-md border px-3 text-sm shadow-xs"
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value)
              setPage(1)
            }}
            className="border-input bg-background h-9 rounded-md border px-3 text-sm shadow-xs"
          />
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value)
              setPage(1)
            }}
            className="border-input bg-background h-9 rounded-md border px-3 text-sm shadow-xs"
          />
        </div>

        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Channels</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : (
                data?.contents.map(
                  (c: {
                    contentId: string
                    userEmail: string
                    displayName?: string
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
                      <TableCell>
                        <div>{c.userEmail}</div>
                        {c.displayName ? (
                          <div className="text-muted-foreground text-xs">{c.displayName}</div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(c.channels ?? []).map((ch) => (
                            <span key={ch} className="bg-muted rounded px-2 py-0.5 text-xs">
                              {ch}
                            </span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[c.status] ?? "bg-muted text-muted-foreground"}`}
                        >
                          {c.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">${Number(c.costUsd).toFixed(6)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : "—"}
                      </TableCell>
                    </TableRow>
                  ),
                )
              )}
            </TableBody>
          </Table>
        </div>

        {data ? (
          <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>{data.total} total</span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= (data.totalPages ?? 1)}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </AdminLayout>
  )
}
