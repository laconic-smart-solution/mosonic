import { useEffect, useRef, useState } from "react"
import { Info } from "lucide-react"
import { useSearchParams } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { LanguageSwitcher } from "@/components/language-switcher"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AccountChannelsSection } from "@/features/settings/components/account-channels-section"
import { AccountSettingsPageHeader } from "@/features/settings/components/account-settings-page-header"
import { AccountSettingsToolbar } from "@/features/settings/components/account-settings-toolbar"
import {
  useDisconnectZernioAccountMutation,
  useSyncZernioAccountsMutation,
  useZernioAccountsQuery,
  useZernioConnectMutation,
} from "@/shared/queries/zernio.query"
import { zernioService } from "@/shared/services/zernio.service"

export default function SettingsAccountsPage() {
  const { t } = useTranslation("settings")
  const [searchParams, setSearchParams] = useSearchParams()
  const accountsQuery = useZernioAccountsQuery()
  const connectMutation = useZernioConnectMutation()
  const syncMutation = useSyncZernioAccountsMutation()
  const disconnectMutation = useDisconnectZernioAccountMutation()
  const handledOAuthRef = useRef(false)
  const initialSyncRef = useRef(false)
  const [profileBusy, setProfileBusy] = useState(false)

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
      onError: () => toast.error(t("oauth.syncFailed")),
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
  }, [searchParams, setSearchParams, syncMutation, t])

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

  function connect(platform: string) {
    connectMutation.mutate(platform, {
      onSuccess: ({ connectUrl }) => {
        window.location.href = connectUrl
      },
      onError: () => toast.error(t("oauth.connectUrlFailed")),
    })
  }

  function disconnect(channel: string) {
    disconnectMutation.mutate(channel, {
      onSuccess: () => toast.success(t("oauth.disconnected")),
      onError: () => toast.error(t("oauth.disconnectFailed")),
    })
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-8 pb-14 sm:px-7">
      <AccountSettingsPageHeader
        actions={
          <AccountSettingsToolbar
            onCreateProfile={ensureProfile}
            onSyncAccounts={() => syncMutation.mutate()}
            createBusy={profileBusy}
            syncBusy={syncMutation.isPending}
          />
        }
      />

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">{t("language.sectionTitle")}</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">{t("language.sectionDesc")}</p>
        <div className="mt-4">
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

      <AccountChannelsSection
        accounts={accountsQuery.data?.accounts}
        loading={accountsQuery.isLoading}
        onConnect={connect}
        onDisconnect={disconnect}
        connectPending={connectMutation.isPending}
        disconnectPending={disconnectMutation.isPending}
      />
    </div>
  )
}
