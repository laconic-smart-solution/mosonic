import { useEffect, useRef, useState } from "react"
import { Info } from "lucide-react"
import { useSearchParams } from "react-router-dom"
import { toast } from "sonner"

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
      onError: () => toast.error("Could not sync accounts."),
    })
  }, [searchParams, syncMutation])

  useEffect(() => {
    if (handledOAuthRef.current) return
    const connected = searchParams.get("connected")
    const error = searchParams.get("zernio_error")
    if (!connected && !error) return
    handledOAuthRef.current = true
    if (connected) {
      toast.success(`${connected} connected. Syncing accounts...`)
      syncMutation.mutate(undefined, {
        onSuccess: () => {
          toast.success("Accounts synced.")
          setSearchParams((prev) => {
            prev.delete("connected")
            prev.delete("zernio_error")
            return prev
          })
        },
      })
      return
    }
    toast.error("Zernio callback failed.")
  }, [searchParams, setSearchParams, syncMutation])

  async function ensureProfile() {
    setProfileBusy(true)
    try {
      await zernioService.createProfile()
      toast.success("Zernio profile ready.")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create profile.")
    } finally {
      setProfileBusy(false)
    }
  }

  function connect(platform: string) {
    connectMutation.mutate(platform, {
      onSuccess: ({ connectUrl }) => {
        window.location.href = connectUrl
      },
      onError: () => toast.error("Could not get connect URL."),
    })
  }

  function disconnect(channel: string) {
    disconnectMutation.mutate(channel, {
      onSuccess: () => toast.success("Channel disconnected."),
      onError: () => toast.error("Could not disconnect account."),
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

      <Alert className="border-dashed bg-muted/30">
        <Info className="size-4 text-muted-foreground" aria-hidden />
        <AlertTitle className="text-sm">After you authorize a network</AlertTitle>
        <AlertDescription className="text-[13px] leading-relaxed">
          You will return to this page and we will sync your Zernio accounts. If Zernio shows a channel as
          connected but it does not appear here, use <span className="font-medium text-foreground">Sync accounts</span>
          .
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
