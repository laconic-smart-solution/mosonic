import { useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Info } from "lucide-react"
import { useSearchParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { PageShell } from "@/components/app/page-shell"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AccountChannelsSection } from "@/features/settings/components/account-channels-section"
import { AccountSettingsPageHeader } from "@/features/settings/components/account-settings-page-header"
import { AccountSettingsToolbar } from "@/features/settings/components/account-settings-toolbar"
import { AccountUserProfileCard } from "@/features/settings/components/account-user-profile-card"
import { toastApiError } from "@/shared/lib/toast-error"
import { parseApiError } from "@/shared/lib/api-error"
import { useAuthStoreHydrated } from "@/shared/hooks/use-auth-store-hydrated"
import { useCurrentPlanQuery, usageQueryKeys } from "@/shared/queries/usage.query"
import { RedNoteQrConnectDialog } from "@/features/settings/components/rednote-qr-connect-dialog"
import {
  useRedNoteAccountQuery,
  useRedNoteConnectMutation,
  useRedNoteDisconnectMutation,
  rednoteQueryKeys,
} from "@/shared/queries/rednote.query"
import {
  useDisconnectZernioAccountMutation,
  useSyncZernioAccountsMutation,
  useZernioAccountsQuery,
  useZernioConnectMutation,
  zernioQueryKeys,
} from "@/shared/queries/zernio.query"
import { useUserStore } from "@/shared/stores/user.store"

export default function SettingsAccountsPage() {
  const { t } = useTranslation("settings")
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const hydrated = useAuthStoreHydrated()
  const user = useUserStore((s) => s.user)
  const accountsQuery = useZernioAccountsQuery()
  const currentPlanQuery = useCurrentPlanQuery()
  const connectMutation = useZernioConnectMutation()
  const syncMutation = useSyncZernioAccountsMutation()
  const disconnectMutation = useDisconnectZernioAccountMutation()
  const rednoteAccountQuery = useRedNoteAccountQuery()
  const rednoteConnectMutation = useRedNoteConnectMutation()
  const rednoteDisconnectMutation = useRedNoteDisconnectMutation()
  const handledOAuthRef = useRef(false)
  const initialSyncRef = useRef(false)
  const [rednoteQrOpen, setRednoteQrOpen] = useState(false)
  const [rednoteSocketRoom, setRednoteSocketRoom] = useState<string | null>(null)

  const allowedChannels = currentPlanQuery.data?.plan?.allowedChannels ?? []

  useEffect(() => {
    const connected = searchParams.get("connected")
    const error = searchParams.get("zernio_error")
    if (connected || error) {
      initialSyncRef.current = true
      return
    }
    if (initialSyncRef.current) return
    initialSyncRef.current = true
    syncMutation.mutate(undefined, {
      onError: (err) => toastApiError(err, "settings:oauth.syncFailed"),
    })
  }, [searchParams, syncMutation, t])

  useEffect(() => {
    if (handledOAuthRef.current) return
    const connected = searchParams.get("connected")
    const error = searchParams.get("zernio_error")
    if (!connected && !error) return
    handledOAuthRef.current = true
    if (connected) {
      toast.success(t("oauth.connectedToast", { platform: connected }))
      void queryClient.invalidateQueries({ queryKey: usageQueryKeys.summary })
      void queryClient.invalidateQueries({ queryKey: ["usage", "history"] })
      syncMutation.mutate(undefined, {
        onSuccess: () => {
          toast.success(t("oauth.syncedToast"))
          setSearchParams((prev) => {
            prev.delete("connected")
            prev.delete("zernio_error")
            return prev
          })
        },
      })
      return
    }
    toast.error(t("oauth.callbackFailed"))
  }, [queryClient, searchParams, setSearchParams, syncMutation, t])

  function connect(platform: string) {
    if (platform === "rednote") {
      rednoteConnectMutation.mutate(undefined, {
        onSuccess: ({ socketRoom }) => {
          setRednoteSocketRoom(socketRoom)
          setRednoteQrOpen(true)
        },
        onError: (err) => {
          if (parseApiError(err).status === 403) {
            toast.error(t("oauth.planRestricted"))
            void currentPlanQuery.refetch()
            return
          }
          toastApiError(err, "settings:oauth.connectUrlFailed")
        },
      })
      return
    }
    connectMutation.mutate(platform, {
      onSuccess: ({ connectUrl }) => {
        window.location.href = connectUrl
      },
      onError: (err) => {
        if (parseApiError(err).status === 403) {
          toast.error(t("oauth.planRestricted"))
          void currentPlanQuery.refetch()
          return
        }
        toastApiError(err, "settings:oauth.connectUrlFailed")
      },
    })
  }

  function disconnect(channel: string) {
    if (channel === "rednote") {
      rednoteDisconnectMutation.mutate(undefined, {
        onSuccess: () => toast.success(t("oauth.disconnected")),
      })
      return
    }
    disconnectMutation.mutate(channel, {
      onSuccess: () => toast.success(t("oauth.disconnected")),
      onError: (err) => toastApiError(err, "settings:oauth.disconnectFailed"),
    })
  }

  const mergedAccounts = (() => {
    const base = accountsQuery.data?.accounts ?? []
    const rn = rednoteAccountQuery.data
    if (!rn?.connected && !rn?.needsReauth) return base
    const handle = rn.handle?.trim() || null
    const idx = base.findIndex((a) => a.channel.toLowerCase() === "rednote")
    if (idx >= 0) {
      const existing = base[idx]
      // Always take handle from the RedNote account API — never keep a stale
      // scraped username from social_accounts while a verified handle exists
      // (or is intentionally absent).
      const next = [...base]
      next[idx] = {
        ...existing,
        username: handle,
        displayName: handle,
      }
      return next
    }
    return [
      ...base,
      {
        userId: user?.id ?? "",
        channel: "rednote",
        accountId: "rednote",
        username: handle,
        displayName: handle,
        connectedAt: rn.lastVerifiedAt ?? new Date().toISOString(),
      },
    ]
  })()

  const needsReauthChannels = rednoteAccountQuery.data?.needsReauth
    ? ["rednote"]
    : []

  return (
    <PageShell>
      <div className="flex w-full flex-col gap-6">
        <AccountSettingsPageHeader />

        <div className="grid gap-6 lg:grid-cols-[minmax(280px,340px)_1fr] lg:items-start">
          <div className="flex min-w-0 flex-col gap-4">
            <AccountUserProfileCard user={user} loading={hydrated && !user} />
          </div>

          <div className="flex min-w-0 flex-col gap-5">
            <Alert className="border-dashed bg-muted/30">
              <Info className="size-4 text-muted-foreground" aria-hidden />
              <AlertTitle className="text-sm">{t("oauth.alertTitle")}</AlertTitle>
              <AlertDescription className="text-[13px] leading-relaxed">
                {t("oauth.alertDesc")}
              </AlertDescription>
            </Alert>

            <div className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0">
                  <h2 className="font-heading text-[17px] tracking-tight text-foreground">
                    {t("channels.sectionTitle")}
                  </h2>
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    {t("channels.sectionDesc")}
                  </p>
                </div>
                <AccountSettingsToolbar
                  onSyncAccounts={() =>
                    syncMutation.mutate(undefined, {
                      onError: (err) =>
                        toastApiError(err, "settings:oauth.syncFailed"),
                    })
                  }
                  syncBusy={syncMutation.isPending}
                />
              </div>

              <AccountChannelsSection
                accounts={mergedAccounts}
                allowedChannels={allowedChannels}
                needsReauthChannels={needsReauthChannels}
                loading={accountsQuery.isLoading}
                onConnect={connect}
                onDisconnect={disconnect}
                connectPending={
                  connectMutation.isPending || rednoteConnectMutation.isPending
                }
                disconnectPending={
                  disconnectMutation.isPending ||
                  rednoteDisconnectMutation.isPending
                }
                hideHeader
              />
            </div>
          </div>
        </div>
      </div>

      <RedNoteQrConnectDialog
        open={rednoteQrOpen}
        onOpenChange={(open) => {
          setRednoteQrOpen(open)
          if (!open) setRednoteSocketRoom(null)
        }}
        socketRoom={rednoteSocketRoom}
        onSuccess={() => {
          toast.success(t("rednote.loginSuccess"))
          void queryClient.invalidateQueries({
            queryKey: rednoteQueryKeys.account,
          })
          void queryClient.invalidateQueries({
            queryKey: zernioQueryKeys.accounts,
          })
        }}
        onFailed={(reason) => {
          toast.error(t("rednote.loginFailed", { reason }))
        }}
      />
    </PageShell>
  )
}
