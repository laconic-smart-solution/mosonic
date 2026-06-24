import { useState } from "react"
import { Check, UserRound } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

import { useAdminUsers } from "../hooks/use-admin-users"

export type AdminUserPickerValue = {
  userId: string
  email?: string
  displayName?: string
}

type AdminUserPickerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedUserId?: string
  onSelect: (user: AdminUserPickerValue | null) => void
}

const PAGE_SIZE = 10

export function AdminUserPickerDialog({
  open,
  onOpenChange,
  selectedUserId,
  onSelect,
}: AdminUserPickerDialogProps) {
  const { t } = useTranslation("admin")
  const { t: tc } = useTranslation("common")
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")

  const { data, isLoading } = useAdminUsers({
    page,
    limit: PAGE_SIZE,
    search: search.trim() || undefined,
  })

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setSearch("")
      setPage(1)
    }
    onOpenChange(next)
  }

  const handleSelect = (user: AdminUserPickerValue | null) => {
    onSelect(user)
    handleOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg gap-0 p-0">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle>{t("usage.userPickerTitle")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 px-5 py-4">
          <Input
            placeholder={t("users.searchPlaceholder")}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />

          <button
            type="button"
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/60",
              selectedUserId ? "border-border" : "border-primary bg-primary/5",
            )}
            onClick={() => handleSelect(null)}
          >
            <UserRound className="size-4 shrink-0 text-muted-foreground" />
            <span className="font-medium">{t("usage.allUsers")}</span>
            {!selectedUserId ? <Check className="ml-auto size-4 text-primary" /> : null}
          </button>

          <div className="max-h-64 space-y-1 overflow-y-auto">
            {isLoading ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t("users.loading")}</p>
            ) : (data?.users ?? []).length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {t("usage.userPickerEmpty")}
              </p>
            ) : (
              data?.users.map(
                (user: {
                  _id: string
                  email?: string
                  displayName?: string
                }) => {
                  const selected = selectedUserId === user._id
                  return (
                    <button
                      key={user._id}
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/60",
                        selected ? "border-primary bg-primary/5" : "border-transparent",
                      )}
                      onClick={() =>
                        handleSelect({
                          userId: user._id,
                          email: user.email,
                          displayName: user.displayName,
                        })
                      }
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{user.email ?? user._id}</div>
                        {user.displayName ? (
                          <div className="truncate text-xs text-muted-foreground">
                            {user.displayName}
                          </div>
                        ) : null}
                      </div>
                      {selected ? <Check className="size-4 shrink-0 text-primary" /> : null}
                    </button>
                  )
                },
              )
            )}
          </div>
        </div>

        {data ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3 text-sm">
            <span className="text-muted-foreground">
              {t("users.showing", {
                start: data.total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1,
                end: Math.min(page * PAGE_SIZE, data.total),
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
      </DialogContent>
    </Dialog>
  )
}
