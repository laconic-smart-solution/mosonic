import { useTranslation } from "react-i18next"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

import { UploadPreviewMedia } from "./upload-preview-media"
import type { MediaTabMode } from "../lib/upload-platform-media"

type UploadMediaDetailDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  mediaTab: MediaTabMode
  imageUrls: string[]
  videoUrl: string | null
  initialImageIndex?: number
}

export function UploadMediaDetailDialog({
  open,
  onOpenChange,
  mediaTab,
  imageUrls,
  videoUrl,
  initialImageIndex = 0,
}: UploadMediaDetailDialogProps) {
  const { t } = useTranslation("upload")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("mediaDetail.title")}</DialogTitle>
          <DialogDescription>{t("mediaDetail.description")}</DialogDescription>
        </DialogHeader>
        <UploadPreviewMedia
          mediaTab={mediaTab}
          imageUrls={imageUrls}
          videoUrl={videoUrl}
          variant="dialog"
          initialIndex={initialImageIndex}
        />
      </DialogContent>
    </Dialog>
  )
}
