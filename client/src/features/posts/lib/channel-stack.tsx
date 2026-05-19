import { Globe } from "lucide-react"

import { cn } from "@/lib/utils"

const CHANNEL_META: Record<
  string,
  { initials: string; className: string }
> = {
  instagram: {
    initials: "In",
    className:
      "bg-gradient-to-br from-pink-500 to-fuchsia-700 text-white shadow-sm",
  },
  facebook: {
    initials: "F",
    className: "bg-[#1877F2] text-white shadow-sm",
  },
  linkedin: {
    initials: "Li",
    className: "bg-[#0A66C2] text-white shadow-sm",
  },
  twitter: {
    initials: "X",
    className: "bg-neutral-900 text-white shadow-sm",
  },
  youtube: {
    initials: "Yt",
    className: "bg-[#FF0000] text-white shadow-sm",
  },
  tiktok: {
    initials: "Tk",
    className: "bg-neutral-950 text-white shadow-sm",
  },
}

type ChannelStackProps = {
  channels: string[]
  /** Tailwind size class for each pill (default ~32px) */
  sizeClass?: string
  className?: string
}

export function ChannelStack({
  channels,
  sizeClass = "size-8",
  className,
}: ChannelStackProps) {
  const keys = [
    ...new Set(
      channels
        .map((c) => c.trim().toLowerCase())
        .filter((c) => c.length > 0),
    ),
  ].slice(0, 6)

  if (keys.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-lg border border-dashed border-muted-foreground/25 bg-muted/40 text-muted-foreground",
          sizeClass,
          className,
        )}
        aria-hidden
      >
        <Globe className="size-4 shrink-0 opacity-70" />
      </div>
    )
  }

  return (
    <div className={cn("flex items-center", className)}>
      {keys.map((k, i) => {
        const meta = CHANNEL_META[k]
        return (
          <div
            key={`${k}-${i}`}
            title={k}
            className={cn(
              "flex items-center justify-center rounded-lg border-2 border-[color:var(--background)] text-[10px] font-bold uppercase tracking-tight",
              sizeClass,
              meta?.className ?? "bg-muted text-muted-foreground",
              i > 0 && "-ml-2",
            )}
          >
            {meta?.initials ?? k.slice(0, 2).toUpperCase()}
          </div>
        )
      })}
    </div>
  )
}
