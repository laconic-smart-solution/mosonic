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
}

export function UploadChannelTabs({
  channels,
  activeKey,
  onSelect,
  dotStatusByKey,
}: UploadChannelTabsProps) {
  return (
    <div className="mb-4 flex flex-wrap gap-1.5">
      {channels.map((ch) => {
        const key = ch.channel.toLowerCase()
        const dot = dotStatusByKey[key] ?? "pending"
        const active = key === activeKey
        return (
          <button
            key={ch.channel}
            type="button"
            onClick={() => onSelect(key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors",
              active
                ? "border-primary bg-muted/80 font-medium text-foreground"
                : "border-border text-muted-foreground hover:bg-muted/50",
            )}
          >
            <span className="capitalize">{ch.channel}</span>
            <span
              className={cn("size-2 shrink-0 rounded-full", tabDotClassName(dot))}
              aria-hidden
            />
          </button>
        )
      })}
    </div>
  )
}
