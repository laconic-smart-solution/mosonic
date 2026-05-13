import { useState } from "react"
import { useNavigate } from "react-router-dom"

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

import { AdminLayout } from "../components/admin-layout"
import { useAdminUserActions, useAdminUsers } from "../hooks/use-admin-users"

export default function AdminUsersPage() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<string | undefined>()
  const { data, isLoading } = useAdminUsers({ page, limit: 20, search, status })
  const { suspend, reactivate } = useAdminUserActions()

  return (
    <AdminLayout>
      <div className="space-y-6 p-6 md:p-8">
        <h1 className="text-2xl font-bold tracking-tight">Users</h1>

        <div className="flex flex-wrap gap-3">
          <Input
            placeholder="Search email or name…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            className="max-w-xs"
          />
          <select
            value={status ?? ""}
            onChange={(e) => {
              setStatus(e.target.value || undefined)
              setPage(1)
            }}
            className="border-input bg-background h-9 rounded-md border px-3 text-sm shadow-xs"
          >
            <option value="">All users</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>

        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead>Last active</TableHead>
                <TableHead className="text-right">Pipelines (MTD)</TableHead>
                <TableHead className="text-right">Cost (MTD)</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="w-[100px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : (
                data?.users.map((user: {
                  _id: string
                  email?: string
                  displayName?: string
                  createdAt: string
                  lastActiveAt?: string | null
                  pipelinesThisMonth: number
                  costThisMonthUsd: number
                  isSuspended: boolean
                  role: string
                }) => (
                  <TableRow
                    key={user._id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/admin/users/${user._id}`)}
                  >
                    <TableCell>
                      <div className="font-medium">{user.email}</div>
                      {user.displayName ? (
                        <div className="text-muted-foreground text-xs">{user.displayName}</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {user.lastActiveAt
                        ? new Date(user.lastActiveAt).toLocaleDateString()
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{user.pipelinesThisMonth}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      ${Number(user.costThisMonthUsd).toFixed(4)}
                    </TableCell>
                    <TableCell className="text-center">
                      <span
                        className={
                          user.isSuspended
                            ? "bg-destructive/15 text-destructive rounded-full px-2 py-0.5 text-xs font-medium"
                            : "rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400"
                        }
                      >
                        {user.isSuspended ? "Suspended" : "Active"}
                      </span>
                    </TableCell>
                    <TableCell
                      className="text-right"
                      onClick={(e) => {
                        e.stopPropagation()
                      }}
                    >
                      {user.role !== "ADMIN" ? (
                        user.isSuspended ? (
                          <Button
                            type="button"
                            variant="link"
                            size="sm"
                            className="h-auto p-0"
                            disabled={reactivate.isPending}
                            onClick={() => reactivate.mutate(user._id)}
                          >
                            Reactivate
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="link"
                            size="sm"
                            className="text-destructive h-auto p-0"
                            disabled={suspend.isPending}
                            onClick={() => suspend.mutate(user._id)}
                          >
                            Suspend
                          </Button>
                        )
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {data ? (
          <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              Showing {(page - 1) * 20 + 1}–{Math.min(page * 20, data.total)} of {data.total} users
            </span>
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
