import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { UploadResolvedOutputs } from "@/shared/types/upload.type"

type UploadPreviewCardProps = {
  resolved: UploadResolvedOutputs
}

export function UploadPreviewCard({ resolved }: UploadPreviewCardProps) {
  const caption = (
    (resolved.text?.trim() && resolved.text) ||
    (resolved.translatedText?.trim() && resolved.translatedText) ||
    (resolved.summary?.trim() && resolved.summary) ||
    ""
  )
  const imageUrl = resolved.image?.trim()
  const videoUrl = resolved.video?.trim()

  return (
    <Card className="gap-0 py-0 shadow-sm">
      <CardHeader className="border-b px-4 pb-3 pt-4 sm:px-6">
        <CardTitle className="text-sm font-semibold text-foreground">
          Content preview
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 px-4 pb-4 pt-3 sm:px-6">
        {resolved.text?.trim() ? (
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase text-muted-foreground">
              Primary text
            </p>
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">
              {resolved.text}
            </p>
          </div>
        ) : null}
        {resolved.translatedText?.trim() ? (
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase text-muted-foreground">
              Translation
            </p>
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">
              {resolved.translatedText}
            </p>
          </div>
        ) : null}
        {resolved.summary?.trim() ? (
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase text-muted-foreground">
              Summary
            </p>
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">
              {resolved.summary}
            </p>
          </div>
        ) : null}
        {!resolved.text?.trim() &&
        !resolved.translatedText?.trim() &&
        !resolved.summary?.trim() ? (
          <p className="text-[13px] text-muted-foreground">
            {caption.trim() ? caption : "No caption text in resolved outputs"}
          </p>
        ) : null}
        {imageUrl ? (
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase text-muted-foreground">
              Image
            </p>
            <img
              src={imageUrl}
              alt=""
              className="mt-1 w-full max-h-[280px] rounded-lg object-cover"
            />
          </div>
        ) : null}
        {videoUrl ? (
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase text-muted-foreground">
              Video
            </p>
            <video
              src={videoUrl}
              controls
              className="mt-1 w-full max-h-[280px] rounded-lg"
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
