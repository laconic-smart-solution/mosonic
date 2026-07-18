import type { MouseEvent, PointerEvent } from "react"
import { Share2 } from "lucide-react"

import { Switch } from "@/components/ui/switch"
import {
  ACCOUNT_CHANNELS,
  type AccountChannelDef,
} from "@/features/settings/constants/account-channels"
import { normalizeChannelKey } from "@/features/upload/lib/upload-platform-media"
import { cn } from "@/lib/utils"

import {
  tabDotClassName,
  type ChannelTabDotStatus,
} from "../lib/upload-channel-ui-status"

type UploadChannelTabsProps = {
  channels: { channel: string }[]
  activeKey: string
  onSelect: (key: string) => void
  layout?: "tabs" | "grid"
  dotStatusByKey: Record<string, ChannelTabDotStatus>
  disabledByKey?: Record<string, boolean>
  /** Per-channel "include in publish" — mirrors `UploadChannelRow.included`. */
  includedByKey: Record<string, boolean>
  onIncludedChange: (channelKey: string, included: boolean) => void
  includeSwitchDisabledByKey?: Record<string, boolean>
  includeSwitchPending?: boolean
}

function resolveChannelDef(channelName: string): AccountChannelDef | undefined {
  const key = normalizeChannelKey(channelName)
  return ACCOUNT_CHANNELS.find(
    (def) => def.id === key || def.matchKeys.includes(key),
  )
}

function ChannelIconTile({
  channelName,
  compact = false,
}: {
  channelName: string
  compact?: boolean
}) {
  const def = resolveChannelDef(channelName)
  const Icon = def?.icon ?? Share2

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg ring-1 ring-foreground/8",
        compact ? "size-7" : "size-9",
        def?.iconTileClass ?? "bg-muted text-muted-foreground",
      )}
      aria-hidden
    >
      <Icon className={compact ? "size-3.5" : "size-[18px]"} strokeWidth={1.75} />
    </div>
  )
}

function stopSwitchBubble(event: MouseEvent | PointerEvent) {
  event.stopPropagation()
}

export function UploadChannelTabs({
  channels,
  activeKey,
  onSelect,
  layout = "tabs",
  dotStatusByKey,
  disabledByKey,
  includedByKey,
  onIncludedChange,
  includeSwitchDisabledByKey,
  includeSwitchPending,
}: UploadChannelTabsProps) {
  const isGrid = layout === "grid"

  return (
    <div
      className={cn(
        isGrid ? "flex flex-col gap-2" : "mb-4 flex flex-wrap gap-2",
      )}
    >
      {channels.map((ch) => {
        const key = ch.channel.toLowerCase()
        const dot = dotStatusByKey[key] ?? "pending"
        const active = key === activeKey
        const disabled = disabledByKey?.[key] ?? false
        const includeDisabled = includeSwitchDisabledByKey?.[key] ?? false
        const included = includedByKey[key] ?? true
        const displayName =
          resolveChannelDef(ch.channel)?.label ?? ch.channel

        if (isGrid) {
          return (
            <div
              key={ch.channel}
              role="button"
              tabIndex={disabled ? -1 : 0}
              aria-current={active ? "true" : undefined}
              aria-disabled={disabled || undefined}
              onClick={() => {
                if (!disabled) onSelect(key)
              }}
              onKeyDown={(event) => {
                if (disabled) return
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault()
                  onSelect(key)
                }
              }}
              className={cn(
                "flex min-h-[56px] min-w-0 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-left outline-none transition-colors",
                "focus-visible:ring-2 focus-visible:ring-primary/30",
                disabled
                  ? "cursor-not-allowed border-border bg-muted/20 text-muted-foreground/60 opacity-80"
                  : active
                    ? "border-primary bg-primary/5 font-medium text-foreground shadow-sm"
                    : "border-border text-foreground/80 hover:border-border hover:bg-muted/40 hover:text-foreground",
              )}
            >
              <ChannelIconTile channelName={ch.channel} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium capitalize">
                    {displayName}
                  </span>
                  <span
                    className={cn("size-2 shrink-0 rounded-full", tabDotClassName(dot))}
                    aria-hidden
                  />
                </div>
              </div>
              <div
                className="flex shrink-0 items-center gap-1.5"
                title="Include in publish"
                onClick={stopSwitchBubble}
                onPointerDown={stopSwitchBubble}
              >
                <Switch
                  size="sm"
                  checked={included}
                  disabled={
                    disabled ||
                    includeDisabled ||
                    Boolean(includeSwitchPending)
                  }
                  aria-label={`Include ${displayName} when publishing`}
                  onCheckedChange={(checked) =>
                    onIncludedChange(key, Boolean(checked))
                  }
                />
              </div>
            </div>
          )
        }

        return (
          <div
            key={ch.channel}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-1.5 py-1 text-xs transition-colors",
              disabled
                ? "cursor-not-allowed border-border bg-muted/20 text-muted-foreground/60 opacity-80"
                : active
                  ? "border-primary bg-muted/80 font-medium text-foreground"
                  : "border-border text-foreground/80 hover:bg-muted/50 hover:text-foreground",
            )}
          >
            <button
              type="button"
              disabled={disabled}
              onClick={() => onSelect(key)}
              className={cn(
                "inline-flex min-w-0 flex-1 items-center gap-1.5 rounded px-2 py-0.5 transition-colors",
                disabled ? "cursor-not-allowed" : "hover:bg-muted/40",
              )}
            >
              <ChannelIconTile channelName={ch.channel} compact />
              <span className="min-w-0 truncate capitalize">{displayName}</span>
              <span
                className={cn("size-2 shrink-0 rounded-full", tabDotClassName(dot))}
                aria-hidden
              />
            </button>
            <div
              className="flex items-center gap-1 border-l border-border/70 pl-1.5"
              title="Include in publish"
            >
              <Switch
                size="sm"
                checked={included}
                disabled={
                  disabled ||
                  includeDisabled ||
                  Boolean(includeSwitchPending)
                }
                aria-label={`Include ${displayName} when publishing`}
                onCheckedChange={(checked) =>
                  onIncludedChange(key, Boolean(checked))
                }
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
