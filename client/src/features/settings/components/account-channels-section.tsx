import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AccountChannelRow } from "@/features/settings/components/account-channel-row"
import { ACCOUNT_CHANNELS } from "@/features/settings/constants/account-channels"
import { buildAccountChannelMap, findConnectedForChannel } from "@/features/settings/lib/account-channel-lookup"
import type { ZernioConnectedAccount } from "@/shared/types/zernio.type"

type AccountChannelsSectionProps = {
  accounts: ZernioConnectedAccount[] | undefined
  loading: boolean
  onConnect: (apiKey: string) => void
  onDisconnect: (channel: string) => void
  connectPending: boolean
  disconnectPending: boolean
}

export function AccountChannelsSection({
  accounts,
  loading,
  onConnect,
  onDisconnect,
  connectPending,
  disconnectPending,
}: AccountChannelsSectionProps) {
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
      <CardHeader className="border-b border-foreground/8 pb-4">
        <CardTitle className="text-base font-semibold">Publishing channels</CardTitle>
        <CardDescription className="text-[13px] leading-relaxed">
          Facebook, X (Twitter), Instagram, YouTube, LinkedIn, and TikTok. Connect only the networks you use;
          they are shared with Upload and scheduling.
        </CardDescription>
      </CardHeader>
      <CardContent className="divide-y divide-border p-0">
        {ACCOUNT_CHANNELS.map((def) => (
          <AccountChannelRow
            key={def.id}
            def={def}
            connected={findConnectedForChannel(def, byChannel)}
            onConnect={onConnect}
            onDisconnect={onDisconnect}
            connectPending={connectPending}
            disconnectPending={disconnectPending}
          />
        ))}
      </CardContent>
    </Card>
  )
}
