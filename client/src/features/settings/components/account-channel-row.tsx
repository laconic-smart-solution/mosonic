import { Loader2, Unlink } from "lucide-react"
import { useTranslation } from "react-i18next"

import { formatCreditAmount } from "@/components/core/credit-usage-badge"
import { Button } from "@/components/ui/button"
import type { AccountChannelDef } from "@/features/settings/constants/account-channels"
import { T } from "@/lib/tokens"
import { cn } from "@/lib/utils"
import type { ZernioConnectedAccount } from "@/shared/types/zernio.type"

type AccountChannelRowProps = {
  def: AccountChannelDef
  connected: ZernioConnectedAccount | undefined
  onConnect: (apiKey: string) => void
  onDisconnect: (channel: string) => void
  connectPending: boolean
  disconnectPending: boolean
  creditsEach?: number
}

export function AccountChannelRow({
  def,
  connected,
  onConnect,
  onDisconnect,
  connectPending,
  disconnectPending,
  creditsEach = 0,
}: AccountChannelRowProps) {
  const { t } = useTranslation("settings")
  const Icon = def.icon
  const isLinked = Boolean(connected)
  const disconnectKey = connected?.channel.trim().toLowerCase() ?? ""
  const label = t(`channels.${def.id}.label`)
  const description = t(`channels.${def.id}.description`)
  const connectCostLabel =
    creditsEach > 0
      ? t("channels.connectCost", { count: formatCreditAmount(creditsEach) })
      : null

  return (
    <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6">
      <div className="flex min-w-0 gap-3.5">
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-foreground/8",
            def.iconTileClass,
          )}
          aria-hidden
        >
          <Icon className="size-[18px]" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-[15px] font-semibold tracking-[-0.2px]" style={{ color: T.textPrimary }}>
              {label}
            </span>
            {isLinked ? (
              <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                {t("channels.connected")}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">{t("channels.notConnected")}</span>
            )}
          </div>
          <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{description}</p>
          {!isLinked && connectCostLabel ? (
            <p className="mt-1 text-[11px] text-muted-foreground">{connectCostLabel}</p>
          ) : null}
          {isLinked && connected ? (
            <p className="mt-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
              <span className="font-sans text-[10px] font-medium uppercase tracking-wide text-foreground/50">
                {t("channels.accountId")}
              </span>{" "}
              <span className="break-all text-foreground/80">{connected.accountId}</span>
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-end sm:pl-4">
        {isLinked ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-w-[104px] gap-1.5"
            disabled={disconnectPending || !disconnectKey}
            onClick={() => onDisconnect(disconnectKey)}
          >
            {disconnectPending ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Unlink className="size-3.5" aria-hidden />
            )}
            {t("channels.disconnect")}
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-w-[104px] gap-1.5"
            style={{ borderColor: T.accentBorder }}
            disabled={connectPending}
            onClick={() => onConnect(def.apiKey)}
            aria-label={
              creditsEach > 0
                ? t("channels.connectAriaWithCost", {
                    channel: label,
                    count: formatCreditAmount(creditsEach),
                  })
                : t("channels.connectAria", { channel: label })
            }
          >
            {connectPending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
            {creditsEach > 0
              ? t("channels.connectWithCredits", {
                  count: formatCreditAmount(creditsEach),
                })
              : t("channels.connect")}
          </Button>
        )}
      </div>
    </div>
  )
}
