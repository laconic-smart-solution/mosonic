import { useState } from "react"
import { Ban, Eye, UserCheck } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"

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
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

import { useAdminUserActions, useAdminUsers } from "../hooks/use-admin-users"

type AdminUserRow = {
  _id: string
  email?: string
  displayName?: string
  createdAt: string
  lastActiveAt?: string | null
  pipelinesThisMonth: number
  costThisMonthUsd: number
  isSuspended: boolean
  role: string
  creditsRemaining: number | null
  creditsPerMonth: number | null
}

type ConfirmAction = {
  userId: string
  email: string
  action: "suspend" | "reactivate"
}

const panelClass = "overflow-hidden rounded-2xl border border-border bg-card"

function roleLabel(t: (key: string) => string, role: string) {
  if (role === "ADMIN") return t("users.roleAdmin")
  if (role === "CUSTOMER") return t("users.roleCustomer")
  return role
}

function formatCredits(user: AdminUserRow) {
  if (user.creditsRemaining == null && user.creditsPerMonth == null) return "—"
  const remaining = user.creditsRemaining ?? 0
  const total = user.creditsPerMonth ?? 0
  return `${remaining.toLocaleString()} / ${total.toLocaleString()}`
}

export default function AdminUsersPage() {
  const { t } = useTranslation("admin")
  const { t: tc } = useTranslation("common")
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<string | undefined>()
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const { data, isLoading } = useAdminUsers({ page, limit: 20, search, status })
  const { suspend, reactivate } = useAdminUserActions()

  const actionPending = suspend.isPending || reactivate.isPending

  const handleConfirm = () => {
    if (!confirmAction) return
    const onSuccess = () => setConfirmAction(null)
    if (confirmAction.action === "suspend") {
      suspend.mutate(confirmAction.userId, { onSuccess })
    } else {
      reactivate.mutate(confirmAction.userId, { onSuccess })
    }
  }

  const users = (data?.users ?? []) as AdminUserRow[]

  return (
    <div className="min-h-full bg-background px-7 py-8 pb-20">
      <div className="mx-auto max-w-[1180px] space-y-6">
        <div>
          <h1 className="font-heading text-[26px] leading-tight tracking-tight text-foreground">
            {t("users.title")}
          </h1>
        </div>

        <div className="flex flex-wrap gap-3">
          <Input
            placeholder={t("users.searchPlaceholder")}
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
            <option value="">{t("users.allUsers")}</option>
            <option value="active">{t("users.active")}</option>
            <option value="suspended">{t("users.suspended")}</option>
          </select>
        </div>

        <section className={panelClass}>
          <Table className="table-fixed min-w-[920px]">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[24%] whitespace-normal">{t("users.tableUser")}</TableHead>
                <TableHead className="w-[10%] whitespace-normal">{t("users.tableRole")}</TableHead>
                <TableHead className="w-[12%] whitespace-normal text-right">
                  {t("users.tableCredits")}
                </TableHead>
                <TableHead className="w-[10%] whitespace-normal">{t("users.tableJoined")}</TableHead>
                <TableHead className="w-[10%] whitespace-normal">{t("users.tableLastActive")}</TableHead>
                <TableHead className="w-[9%] text-right">{t("users.tablePipelinesMtd")}</TableHead>
                <TableHead className="w-[10%] text-right">{t("users.tableCostMtd")}</TableHead>
                <TableHead className="w-[9%] text-center">{t("users.tableStatus")}</TableHead>
                <TableHead className="w-[96px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="whitespace-normal py-10 text-center text-muted-foreground">
                    {t("users.loading")}
                  </TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="whitespace-normal py-10 text-center text-muted-foreground">
                    {t("users.empty")}
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => (
                  <TableRow
                    key={user._id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/admin/users/${user._id}`)}
                  >
                    <TableCell className="whitespace-normal align-top">
                      <div className="truncate font-medium">{user.email ?? "—"}</div>
                      {user.displayName ? (
                        <div className="truncate text-xs text-muted-foreground">{user.displayName}</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="whitespace-normal align-top">
                      <Badge variant={user.role === "ADMIN" ? "default" : "secondary"}>
                        {roleLabel(t, user.role)}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-normal align-top text-right font-mono text-sm tabular-nums">
                      {formatCredits(user)}
                    </TableCell>
                    <TableCell className="whitespace-normal align-top text-muted-foreground">
                      {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell className="whitespace-normal align-top text-muted-foreground">
                      {user.lastActiveAt
                        ? new Date(user.lastActiveAt).toLocaleDateString()
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums align-top">
                      {user.pipelinesThisMonth}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums align-top">
                      ${Number(user.costThisMonthUsd).toFixed(4)}
                    </TableCell>
                    <TableCell className="text-center align-top">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                          user.isSuspended
                            ? "bg-destructive/15 text-destructive"
                            : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
                        )}
                      >
                        {user.isSuspended ? t("users.suspended") : t("users.active")}
                      </span>
                    </TableCell>
                    <TableCell
                      className="align-top"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex justify-end gap-0.5">
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label={t("users.viewUser")}
                          onClick={() => navigate(`/admin/users/${user._id}`)}
                        >
                          <Eye className="size-3.5" />
                        </Button>
                        {user.role !== "ADMIN" ? (
                          user.isSuspended ? (
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="ghost"
                              aria-label={t("users.reactivate")}
                              disabled={actionPending}
                              onClick={() =>
                                setConfirmAction({
                                  userId: user._id,
                                  email: user.email ?? user.displayName ?? user._id,
                                  action: "reactivate",
                                })
                              }
                            >
                              <UserCheck className="size-3.5" />
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              aria-label={t("users.suspend")}
                              disabled={actionPending}
                              onClick={() =>
                                setConfirmAction({
                                  userId: user._id,
                                  email: user.email ?? user.displayName ?? user._id,
                                  action: "suspend",
                                })
                              }
                            >
                              <Ban className="size-3.5" />
                            </Button>
                          )
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </section>

        {data ? (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>
              {t("users.showing", {
                start: users.length ? (page - 1) * 20 + 1 : 0,
                end: Math.min(page * 20, data.total),
                total: data.total,
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
              {confirmAction?.action === "suspend"
                ? t("users.suspendConfirmTitle")
                : t("users.reactivateConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.action === "suspend"
                ? t("users.suspendConfirmDescription", { email: confirmAction.email })
                : t("users.reactivateConfirmDescription", { email: confirmAction?.email ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionPending}>{tc("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={actionPending}
              className={
                confirmAction?.action === "suspend"
                  ? "bg-destructive text-white hover:bg-destructive/90"
                  : undefined
              }
              onClick={(e) => {
                e.preventDefault()
                handleConfirm()
              }}
            >
              {confirmAction?.action === "suspend" ? t("users.suspend") : t("users.reactivate")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
