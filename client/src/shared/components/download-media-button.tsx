import { useState } from "react"
import { Download, Loader2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { downloadMedia } from "@/shared/lib/download-media"

type DownloadMediaButtonProps = {
  /** Resolved media src (blob/data/http URL) or a stored relative path — anything downloadMedia() accepts. */
  src: string | undefined
  filename: string
  /** Label used for the aria-label/title, e.g. "generated image", "post video". Defaults to the filename. */
  label?: string
  className?: string
  size?: "xs" | "sm" | "md"
}

const SIZE_CLASSES: Record<NonNullable<DownloadMediaButtonProps["size"]>, string> = {
  xs: "size-6",
  sm: "size-7",
  md: "size-8",
}

const ICON_SIZE_CLASSES: Record<NonNullable<DownloadMediaButtonProps["size"]>, string> = {
  xs: "size-3",
  sm: "size-3.5",
  md: "size-4",
}

/**
 * Small icon button that downloads a piece of media to the user's device.
 * Unstyled for positioning — pass `className` to place it as a hover
 * overlay, an inline action, etc. Renders nothing when there's no src yet
 * (media still loading), so callers can mount it unconditionally.
 */
export function DownloadMediaButton({
  src,
  filename,
  label,
  className,
  size = "sm",
}: DownloadMediaButtonProps) {
  const { t } = useTranslation("common")
  const [pending, setPending] = useState(false)

  if (!src) return null

  const ariaLabel = t("actions.downloadAria", { name: label ?? filename })

  return (
    <button
      type="button"
      disabled={pending}
      aria-label={ariaLabel}
      title={ariaLabel}
      className={cn(
        "flex shrink-0 cursor-pointer items-center justify-center rounded-md border shadow-sm transition-colors",
        "border-border bg-card/90 text-foreground/80 backdrop-blur hover:bg-card hover:text-foreground",
        "disabled:cursor-not-allowed disabled:opacity-60",
        SIZE_CLASSES[size],
        className
      )}
      onClick={async (event) => {
        event.stopPropagation()
        event.preventDefault()
        setPending(true)
        try {
          await downloadMedia(src, filename)
        } catch {
          toast.error(t("actions.downloadFailed"))
        } finally {
          setPending(false)
        }
      }}
    >
      {pending ? (
        <Loader2 className={cn(ICON_SIZE_CLASSES[size], "animate-spin")} />
      ) : (
        <Download className={ICON_SIZE_CLASSES[size]} />
      )}
    </button>
  )
}
