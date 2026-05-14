import { cn } from "@/lib/utils"
import { useFileObjectUrl } from "@/shared/hooks/use-file-object-url"

/** Resolves file-service paths the same way as content detail (`useFileObjectUrl`). */
export function FileServiceImage({
  url,
  className,
  alt = "",
  loadingClassName,
}: {
  url: string
  className?: string
  alt?: string
  /** Applied to the loading placeholder wrapper */
  loadingClassName?: string
}) {
  const src = useFileObjectUrl(url)
  if (!src) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-muted text-[10px] text-muted-foreground",
          loadingClassName,
        )}
      >
        Loading…
      </div>
    )
  }
  return <img src={src} alt={alt} className={className} />
}

export function FileServiceVideo({
  url,
  className,
  controls = false,
  muted = true,
  playsInline = true,
}: {
  url: string
  className?: string
  controls?: boolean
  muted?: boolean
  playsInline?: boolean
}) {
  const src = useFileObjectUrl(url)
  if (!src) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-muted text-[10px] text-muted-foreground",
          className,
        )}
      >
        Loading…
      </div>
    )
  }
  return (
    <video
      src={src}
      className={className}
      controls={controls}
      muted={muted}
      playsInline={playsInline}
    />
  )
}
