import { useTranslation } from "react-i18next"

import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AccountChannelRow } from "@/features/settings/components/account-channel-row"
import { ACCOUNT_CHANNELS } from "@/features/settings/constants/account-channels"
import { buildAccountChannelMap, findConnectedForChannel, isChannelUnlocked } from "@/features/settings/lib/account-channel-lookup"
import type { ZernioConnectedAccount } from "@/shared/types/zernio.type"

type AccountChannelsSectionProps = {
  accounts: ZernioConnectedAccount[] | undefined
  unlockedChannels: string[] | undefined
  loading: boolean
  onUnlock: (apiKey: string) => void
  onConnect: (apiKey: string) => void
  onDisconnect: (channel: string) => void
  unlockPending: boolean
  connectPending: boolean
  disconnectPending: boolean
  hideHeader?: boolean
  creditsEach?: number
}

export function AccountChannelsSection({
  accounts,
  unlockedChannels,
  loading,
  onUnlock,
  onConnect,
  onDisconnect,
  unlockPending,
  connectPending,
  disconnectPending,
  hideHeader = false,
  creditsEach = 0,
}: AccountChannelsSectionProps) {
  const { t } = useTranslation("settings")

  if (loading) {
    return (
      <Card className="overflow-hidden shadow-none">
        <CardHeader className="border-b border-foreground/8 pb-4">
          <Skeleton className="h-5 w-40 rounded-md" />
          <Skeleton className="mt-2 h-3 w-64 max-w-full rounded-md" />
        </CardHeader>
        <CardContent className="divide-y divide-border p-0">
          {ACCOUNT_CHANNELS.map((c) => (
            <div key={c.id} className="flex items-center gap-4 px-6 py-4">
              <Skeleton className="size-10 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-28 rounded-md" />
                <Skeleton className="h-3 w-full max-w-md rounded-md" />
              </div>
              <Skeleton className="h-8 w-[104px] shrink-0 rounded-md" />
            </div>
          ))}
        </CardContent>
      </Card>
    )
  }

  const byChannel = buildAccountChannelMap(accounts)

  return (
    <Card className="overflow-hidden shadow-none ring-1 ring-foreground/8">
      {hideHeader ? null : (
        <CardHeader className="border-b border-foreground/8 pb-4">
          <CardTitle className="text-base font-semibold">{t("channels.sectionTitle")}</CardTitle>
          <CardDescription className="text-[13px] leading-relaxed">
            {t("channels.sectionDesc")}
          </CardDescription>
        </CardHeader>
      )}
      <CardContent className="divide-y divide-border p-0">
        {ACCOUNT_CHANNELS.map((def) => (
          <AccountChannelRow
            key={def.id}
            def={def}
            connected={findConnectedForChannel(def, byChannel)}
            unlocked={isChannelUnlocked(def, unlockedChannels)}
            onUnlock={onUnlock}
            onConnect={onConnect}
            onDisconnect={onDisconnect}
            unlockPending={unlockPending}
            connectPending={connectPending}
            disconnectPending={disconnectPending}
            creditsEach={creditsEach}
          />
        ))}
      </CardContent>
    </Card>
  )
}
