import { cn } from "@/lib/utils"
import { MediaLoadPlaceholder } from "@/shared/components/media-load-placeholder"
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
  const media = useFileObjectUrl(url)
  if (media.status === "ready" && media.src) {
    return <img src={media.src} alt={alt} className={className} />
  }
  if (media.status === "error") {
    return (
      <MediaLoadPlaceholder
        className={loadingClassName}
        progress={null}
        status="error"
        kind="image"
      />
    )
  }
  return (
    <MediaLoadPlaceholder
      className={loadingClassName}
      progress={media.progress}
      kind="image"
    />
  )
}

export function FileServiceVideo({
  url,
  className,
  controls = false,
  muted = true,
  playsInline = true,
  autoPlay = false,
  loop = false,
}: {
  url: string
  className?: string
  controls?: boolean
  muted?: boolean
  playsInline?: boolean
  autoPlay?: boolean
  loop?: boolean
}) {
  const media = useFileObjectUrl(url)
  if (media.status === "ready" && media.src) {
    return (
      <video
        src={media.src}
        className={className}
        controls={controls}
        muted={muted}
        playsInline={playsInline}
        autoPlay={autoPlay}
        loop={loop}
      />
    )
  }
  if (media.status === "error") {
    return (
      <MediaLoadPlaceholder
        className={cn(className)}
        progress={null}
        status="error"
        kind="video"
      />
    )
  }
  return (
    <MediaLoadPlaceholder
      className={cn(className)}
      progress={media.progress}
      kind="video"
    />
  )
}
