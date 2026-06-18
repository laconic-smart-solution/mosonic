import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { UploadPlatformPreview } from "@/features/upload/components/upload-platform-preview"
import { UploadStatusBanner } from "@/features/upload/components/upload-status-banner"
import { getPlatformMediaConfig } from "@/features/upload/lib/upload-platform-media"
import type { BannerVariant } from "@/features/upload/components/upload-status-banner"
import type { MediaTabMode } from "@/features/upload/lib/upload-platform-media"
import { useTranslation } from "react-i18next"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  channel: string | null | undefined
  caption: string
  mediaTab: MediaTabMode
  imageUrls: string[]
  videoUrl: string | null
  youtubeTitle: string
  bannerVariant: BannerVariant
  publishedAt: string | null
  scheduledAt: string | null
  onConnect?: () => void
  onRetry?: () => void
}

export function UploadPreviewDialog({
  open,
  onOpenChange,
  channel,
  caption,
  mediaTab,
  imageUrls,
  videoUrl,
  youtubeTitle,
  bannerVariant,
  publishedAt,
  scheduledAt,
  onConnect,
  onRetry,
}: Props) {
  const { t } = useTranslation("upload")

  if (!channel) return null

  let platformLabel = channel
  try {
    platformLabel = getPlatformMediaConfig(channel).displayName
  } catch {
    // ignore
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("preview.dialogTitle", { platform: platformLabel })}</DialogTitle>
          <DialogDescription>{t("preview.dialogDescription")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <UploadStatusBanner
            platformLabel={platformLabel}
            variant={bannerVariant}
            publishedAt={publishedAt}
            scheduledAt={scheduledAt}
            onConnect={onConnect}
            onRetry={onRetry}
          />
          <UploadPlatformPreview
            channel={channel}
            caption={caption}
            mediaTab={mediaTab}
            imageUrls={imageUrls}
            videoUrl={videoUrl}
            youtubeTitle={youtubeTitle}
            variant="dialog"
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
