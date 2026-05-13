import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { UPLOAD_STATUS_META } from "@/features/upload/constants/upload-publish"
import {
  captionFromOutputs,
  defaultChannelSelection,
  inferCaptionSource,
  type CaptionSourceOption,
  type ChannelSelection,
  type MediaChoice,
} from "@/features/upload/lib/upload-publish.helpers"
import { cn } from "@/lib/utils"
import type { UploadChannelRow, UploadResolvedOutputs } from "@/shared/types/upload.type"

type UploadChannelCardProps = {
  channel: UploadChannelRow
  channelKey: string
  connected: boolean
  resolvedOutputs: UploadResolvedOutputs
  selection: ChannelSelection
  onNavigateSettings: () => void
  onSelectionChange: (patch: Partial<ChannelSelection>) => void
}

const CAPTION_OPTS: Array<{ id: CaptionSourceOption; label: string }> = [
  { id: "text", label: "Primary text" },
  { id: "translatedText", label: "Translated" },
  { id: "summary", label: "Summary" },
  { id: "custom", label: "Custom" },
]

const MEDIA_OPTS: Array<{ id: MediaChoice; label: string }> = [
  { id: "auto", label: "Auto" },
  { id: "image", label: "Image" },
  { id: "video", label: "Video" },
  { id: "none", label: "None" },
]

export function UploadChannelCard({
  channel,
  channelKey,
  connected,
  resolvedOutputs,
  selection,
  onNavigateSettings,
  onSelectionChange,
}: UploadChannelCardProps) {
  const statusMeta = UPLOAD_STATUS_META[channel.status]
  const captionAutoLabel = inferCaptionSource(channel, resolvedOutputs)
  const primaryMediaUrl =
    channel.mediaUrls?.map((u) => u.trim()).find(Boolean) ||
    channel.mediaUrl?.trim() ||
    ""
  const mediaAutoLabel =
    !primaryMediaUrl
      ? "text-only"
      : /\.(mp4|webm|mov)(\?|$)/i.test(primaryMediaUrl)
        ? "video"
        : "image"

  function applyCaptionSource(next: CaptionSourceOption) {
    if (next === "custom") {
      onSelectionChange({
        captionSource: "custom",
        isOverridden: true,
      })
      return
    }
    const nextText = captionFromOutputs(next, resolvedOutputs)
    onSelectionChange({
      captionSource: next,
      captionDraft: nextText,
      isOverridden: true,
    })
  }

  return (
    <Card size="sm" className="gap-0 py-0 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-foreground">{channel.channel}</span>
          {selection.isOverridden ? (
            <span className="rounded-md bg-muted px-1.5 py-px text-[10px] font-semibold uppercase text-muted-foreground">
              Edited
            </span>
          ) : null}
        </div>
        <span className={cn("text-xs font-medium", statusMeta.className)}>{statusMeta.label}</span>
      </div>
      <CardContent className="flex flex-col gap-2 px-4 py-3 sm:px-6">
        {!connected ? (
          <p className="mb-1 text-xs text-muted-foreground">
            Not connected.{" "}
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 text-xs font-medium"
              onClick={onNavigateSettings}
            >
              Go to Settings
            </Button>
          </p>
        ) : null}

        {selection.included && connected ? (
          <div className="space-y-2 rounded-lg border border-border/80 bg-muted/40 p-2.5">
            {!selection.isOverridden ? (
              <div className="space-y-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-foreground">
                    Caption (auto: {captionAutoLabel})
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() =>
                      onSelectionChange({
                        isOverridden: true,
                        captionDraft: channel.caption ?? "",
                        captionSource: inferCaptionSource(channel, resolvedOutputs),
                        mediaChoice: "auto",
                      })
                    }
                  >
                    Edit this post
                  </Button>
                </div>
                <p className="whitespace-pre-wrap text-muted-foreground">
                  {(channel.caption ?? "").trim() || "No caption"}
                </p>
                <div className="text-[11px] font-medium text-muted-foreground">
                  Media (auto): {mediaAutoLabel}
                </div>
                {primaryMediaUrl ? (
                  /\.(mp4|webm|mov)(\?|$)/i.test(primaryMediaUrl) ? (
                    <video
                      src={primaryMediaUrl}
                      controls
                      className="max-h-40 w-full rounded-md border bg-background"
                    />
                  ) : (
                    <img
                      src={primaryMediaUrl}
                      alt=""
                      className="max-h-40 w-full rounded-md border object-cover"
                    />
                  )
                ) : (
                  <p className="text-[11px] text-muted-foreground">No attachment</p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Label className="text-xs font-semibold">Caption source</Label>
                  <Select
                    value={selection.captionSource}
                    onValueChange={(v) => applyCaptionSource(v as CaptionSourceOption)}
                  >
                    <SelectTrigger className="h-8 w-[min(100%,240px)] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CAPTION_OPTS.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Textarea
                  value={selection.captionDraft}
                  onChange={(e) =>
                    onSelectionChange({
                      captionDraft: e.target.value,
                      isOverridden: true,
                      captionSource: "custom",
                    })
                  }
                  rows={4}
                  className="text-xs"
                />

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Media</Label>
                  <RadioGroup
                    value={selection.mediaChoice}
                    onValueChange={(v) =>
                      onSelectionChange({
                        mediaChoice: v as MediaChoice,
                        isOverridden: true,
                      })
                    }
                    className="flex flex-wrap gap-3"
                  >
                    {MEDIA_OPTS.map((o) => (
                      <div key={o.id} className="flex items-center gap-1.5">
                        <RadioGroupItem value={o.id} id={`${channelKey}-${o.id}`} />
                        <Label
                          htmlFor={`${channelKey}-${o.id}`}
                          className="cursor-pointer text-xs font-normal"
                        >
                          {o.label}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() =>
                    onSelectionChange(
                      defaultChannelSelection(channel, connected, resolvedOutputs)
                    )
                  }
                >
                  Reset to auto
                </Button>
              </div>
            )}
          </div>
        ) : null}

        <Label className="flex cursor-pointer items-center gap-2 text-xs font-normal">
          <Checkbox
            checked={selection.included}
            disabled={!connected}
            onCheckedChange={(v) =>
              onSelectionChange({ included: v === true })
            }
          />
          Include in publish
        </Label>

        {channel.failureReason ? (
          <p className="mt-1 text-[11px] text-destructive">{channel.failureReason}</p>
        ) : null}
      </CardContent>
    </Card>
  )
}
