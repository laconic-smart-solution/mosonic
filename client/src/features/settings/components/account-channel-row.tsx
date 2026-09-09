import { Link2, Loader2, Lock, Unlink } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"

import { Button } from "@/components/ui/button"
import type { AccountChannelDef } from "@/features/settings/constants/account-channels"
import { formatConnectedAccountLabel } from "@/features/settings/lib/connected-account-label"
import { T } from "@/lib/tokens"
import { cn } from "@/lib/utils"
import type { ZernioConnectedAccount } from "@/shared/types/zernio.type"

type AccountChannelRowProps = {
  def: AccountChannelDef
  connected: ZernioConnectedAccount | undefined
  allowed: boolean
  needsReauth?: boolean
  onConnect: (apiKey: string) => void
  onDisconnect: (channel: string) => void
  connectPending: boolean
  disconnectPending: boolean
}

export function AccountChannelRow({
  def,
  connected,
  allowed,
  needsReauth = false,
  onConnect,
  onDisconnect,
  connectPending,
  disconnectPending,
}: AccountChannelRowProps) {
  const { t } = useTranslation("settings")
  const navigate = useNavigate()
  const Icon = def.icon
  const isLinked = Boolean(connected) && !needsReauth
  const disconnectKey = connected?.channel.trim().toLowerCase() ?? def.apiKey
  const label = t(`channels.${def.id}.label`)
  const platformDescription = t(`channels.${def.id}.description`)
  const connectedLabel =
    isLinked && connected ? formatConnectedAccountLabel(connected) : null
  const planLocked = !isLinked && !needsReauth && !allowed

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
            {needsReauth ? (
              <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                {t("rednote.needsReauth")}
              </span>
            ) : isLinked ? (
              <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                {t("channels.connected")}
              </span>
            ) : planLocked ? (
              <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <Lock className="size-3" aria-hidden />
                {t("channels.planLocked")}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">{t("channels.notConnected")}</span>
            )}
          </div>
          {connectedLabel ? (
            <p
              className="mt-1 text-[13px] font-medium leading-snug tracking-[-0.1px]"
              style={{ color: T.textPrimary }}
            >
              {connectedLabel}
            </p>
          ) : (
            <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
              {platformDescription}
            </p>
          )}
          {planLocked ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t("channels.planLockedDesc")}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2 sm:pl-4">
        {needsReauth ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-w-[104px] gap-1.5"
            style={{ borderColor: T.accentBorder }}
            disabled={connectPending}
            onClick={() => onConnect(def.apiKey)}
            aria-label={t("channels.connectAria", { channel: label })}
          >
            {connectPending ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Link2 className="size-3.5" aria-hidden />
            )}
            {t("channels.connect")}
          </Button>
        ) : isLinked ? (
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
        ) : planLocked ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-w-[104px] gap-1.5"
            onClick={() => navigate("/usage/plans")}
            aria-label={t("channels.upgradePlanAria", { channel: label })}
          >
            <Lock className="size-3.5" aria-hidden />
            {t("channels.upgradePlan")}
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
            aria-label={t("channels.connectAria", { channel: label })}
          >
            {connectPending ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Link2 className="size-3.5" aria-hidden />
            )}
            {t("channels.connect")}
          </Button>
        )}
      </div>
    </div>
  )
}
