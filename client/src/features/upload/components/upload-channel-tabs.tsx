import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

import {
  tabDotClassName,
  type ChannelTabDotStatus,
} from "../lib/upload-channel-ui-status"

type UploadChannelTabsProps = {
  channels: { channel: string }[]
  activeKey: string
  onSelect: (key: string) => void
  dotStatusByKey: Record<string, ChannelTabDotStatus>
  disabledByKey?: Record<string, boolean>
  /** Per-channel "include in publish" — mirrors `UploadChannelRow.included`. */
  includedByKey: Record<string, boolean>
  onIncludedChange: (channelKey: string, included: boolean) => void
  includeSwitchDisabledByKey?: Record<string, boolean>
  includeSwitchPending?: boolean
}

export function UploadChannelTabs({
  channels,
  activeKey,
  onSelect,
  dotStatusByKey,
  disabledByKey,
  includedByKey,
  onIncludedChange,
  includeSwitchDisabledByKey,
  includeSwitchPending,
}: UploadChannelTabsProps) {
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {channels.map((ch) => {
        const key = ch.channel.toLowerCase()
        const dot = dotStatusByKey[key] ?? "pending"
        const active = key === activeKey
        const disabled = disabledByKey?.[key] ?? false
        const includeDisabled =
          includeSwitchDisabledByKey?.[key] ?? false
        const included = includedByKey[key] ?? true

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
                "inline-flex items-center gap-1.5 rounded px-2 py-0.5 transition-colors",
                disabled ? "cursor-not-allowed" : "hover:bg-muted/40",
              )}
            >
              <span className="capitalize">{ch.channel}</span>
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
                aria-label={`Include ${ch.channel} when publishing`}
                onCheckedChange={(checked) => onIncludedChange(key, Boolean(checked))}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
