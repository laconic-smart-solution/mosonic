import { useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Info } from "lucide-react"
import { useSearchParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { LanguageSwitcher } from "@/components/language-switcher"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AccountChannelsSection } from "@/features/settings/components/account-channels-section"
import { AccountSettingsPageHeader } from "@/features/settings/components/account-settings-page-header"
import { AccountSettingsToolbar } from "@/features/settings/components/account-settings-toolbar"
import { AccountUserProfileCard } from "@/features/settings/components/account-user-profile-card"
import { SocialUnlockConfirmDialog } from "@/features/settings/components/social-unlock-confirm-dialog"
import { ACCOUNT_CHANNELS } from "@/features/settings/constants/account-channels"
import { getApiErrorMessage } from "@/features/upload/lib/upload-publish.helpers"
import { useAuthStoreHydrated } from "@/shared/hooks/use-auth-store-hydrated"
import { usageQueryKeys } from "@/shared/queries/usage.query"
import {
  useDisconnectZernioAccountMutation,
  useSyncZernioAccountsMutation,
  useZernioAccountsQuery,
  useZernioConnectionCreditQuery,
  useZernioUnlockMutation,
  zernioQueryKeys,
} from "@/shared/queries/zernio.query"
import { useUserStore } from "@/shared/stores/user.store"
import { zernioService } from "@/shared/services/zernio.service"

const panelClass = "overflow-hidden rounded-2xl border border-border bg-card"

export default function SettingsAccountsPage() {
  const { t } = useTranslation("settings")
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const hydrated = useAuthStoreHydrated()
  const user = useUserStore((s) => s.user)
  const accountsQuery = useZernioAccountsQuery()
  const connectionCreditQuery = useZernioConnectionCreditQuery()
  const unlockMutation = useZernioUnlockMutation()
  const syncMutation = useSyncZernioAccountsMutation()
  const disconnectMutation = useDisconnectZernioAccountMutation()
  const handledOAuthRef = useRef(false)
  const initialSyncRef = useRef(false)
  const [profileBusy, setProfileBusy] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingPlatform, setPendingPlatform] = useState<string | null>(null)

  const creditsEach = connectionCreditQuery.data?.creditsEach ?? 0
  const creditsRemaining = connectionCreditQuery.data?.creditsRemaining ?? 0

  const pendingChannelDef = pendingPlatform
    ? ACCOUNT_CHANNELS.find((c) => c.apiKey === pendingPlatform)
    : undefined
  const pendingChannelLabel = pendingChannelDef
    ? t(`channels.${pendingChannelDef.id}.label`)
    : pendingPlatform ?? ""

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
      onError: (err) => toast.error(getApiErrorMessage(err) || t("oauth.syncFailed")),
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
      void queryClient.invalidateQueries({
        queryKey: zernioQueryKeys.connectionCredit,
      })
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

  async function ensureProfile() {
    setProfileBusy(true)
    try {
      await zernioService.createProfile()
      toast.success(t("oauth.profileReady"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("oauth.profileFailed"))
    } finally {
      setProfileBusy(false)
    }
  }

  function requestUnlock(platform: string) {
    setPendingPlatform(platform)
    setConfirmOpen(true)
  }

  function confirmUnlock() {
    if (!pendingPlatform) return
    unlockMutation.mutate(pendingPlatform, {
      onSuccess: ({ connectUrl }) => {
        setConfirmOpen(false)
        setPendingPlatform(null)
        window.location.href = connectUrl
      },
      onError: (err) => {
        const status = (err as { response?: { status?: number } })?.response
          ?.status
        if (status === 402) {
          toast.error(t("unlockConfirm.insufficientTitle"))
          void connectionCreditQuery.refetch()
          return
        }
        toast.error(t("oauth.unlockFailed"))
      },
    })
  }

  function disconnect(channel: string) {
    disconnectMutation.mutate(channel, {
      onSuccess: () => toast.success(t("oauth.disconnected")),
      onError: () => toast.error(t("oauth.disconnectFailed")),
    })
  }

  return (
    <div className="min-h-full bg-background px-5 py-6 md:px-7 md:py-8 md:pb-12">
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-6">
        <AccountSettingsPageHeader />

        <div className="grid gap-6 lg:grid-cols-[minmax(0,300px)_1fr] lg:items-start">
          <AccountUserProfileCard user={user} loading={hydrated && !user} />

          <div className="flex min-w-0 flex-col gap-6">
            <section className={panelClass}>
              <div className="border-b border-border px-5 py-4">
                <h2 className="font-heading text-[17px] tracking-tight text-foreground">
                  {t("language.sectionTitle")}
                </h2>
                <p className="mt-1 text-[13px] text-muted-foreground">{t("language.sectionDesc")}</p>
              </div>
              <div className="p-5">
                <LanguageSwitcher size="default" />
              </div>
            </section>

            <Alert className="border-dashed bg-muted/30">
              <Info className="size-4 text-muted-foreground" aria-hidden />
              <AlertTitle className="text-sm">{t("oauth.alertTitle")}</AlertTitle>
              <AlertDescription className="text-[13px] leading-relaxed">
                {t("oauth.alertDesc")}
              </AlertDescription>
            </Alert>

            <div className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <h2 className="font-heading text-[17px] tracking-tight text-foreground">
                    {t("channels.sectionTitle")}
                  </h2>
                  <p className="mt-1 text-[13px] text-muted-foreground">{t("channels.sectionDesc")}</p>
                </div>
                <AccountSettingsToolbar
                  onCreateProfile={ensureProfile}
                  onSyncAccounts={() =>
                    syncMutation.mutate(undefined, {
                      onError: (err) =>
                        toast.error(getApiErrorMessage(err) || t("oauth.syncFailed")),
                    })
                  }
                  createBusy={profileBusy}
                  syncBusy={syncMutation.isPending}
                />
              </div>

              <AccountChannelsSection
                accounts={accountsQuery.data?.accounts}
                loading={accountsQuery.isLoading}
                onUnlock={requestUnlock}
                onDisconnect={disconnect}
                unlockPending={unlockMutation.isPending}
                disconnectPending={disconnectMutation.isPending}
                creditsEach={creditsEach}
                hideHeader
              />
            </div>
          </div>
        </div>
      </div>

      <SocialUnlockConfirmDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open)
          if (!open) setPendingPlatform(null)
        }}
        channelLabel={pendingChannelLabel}
        creditsEach={creditsEach}
        creditsRemaining={creditsRemaining}
        loading={connectionCreditQuery.isLoading}
        onConfirm={confirmUnlock}
        isUnlocking={unlockMutation.isPending}
      />
    </div>
  )
}
