import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Eye } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { FileServiceImage } from "@/features/upload/components/upload-display-media"
import { channelLabel } from "@/shared/constants/distribution-channels"
import { useGetContentQuery } from "@/shared/queries/content.query"
import {
  collectContentChannels,
  previewForChannel,
  type ContentDraftNode,
} from "../../lib/content-channel-preview"
import {
  ChatDialogBody,
  ChatDialogFooter,
  ChatDialogHeading,
} from "./chat-dialog-shell"
import { CHAT_DIALOG_CONTENT_CLASS, chatDialogButton } from "../../lib/chat-dialog-styles"

type LangTab = "original" | "translated" | "summary"

const LANE_PILL: Record<string, string> = {
  instagram: "bg-gradient-to-br from-pink-500 to-fuchsia-700 text-white",
  facebook: "bg-[#1877F2] text-white",
  linkedin: "bg-[#0A66C2] text-white",
  youtube: "bg-[#FF0000] text-white",
  tiktok: "bg-neutral-950 text-white",
  rednote: "bg-[#FF2442] text-white",
}

/** 01 · Check content — large preview of one content draft. */
export function ChatCheckContentDialog({
  open,
  onOpenChange,
  contentId,
  initialChannel,
  onApprove,
  onEdit,
  onReject,
  onRegenerate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  contentId: string
  initialChannel?: string | null
  onApprove: () => void
  onEdit: () => void
  onReject: () => void
  onRegenerate: () => void
}) {
  const { t } = useTranslation("chat")
  const query = useGetContentQuery(open ? contentId : undefined)
  const [tab, setTab] = useState<LangTab>("original")
  const [selectedChannel, setSelectedChannel] = useState<string | null>(initialChannel ?? null)

  const nodes = (query.data?.nodes ?? []) as ContentDraftNode[]
  const channels = useMemo(
    () => collectContentChannels(query.data?.lanes, nodes),
    [query.data?.lanes, nodes],
  )

  useEffect(() => {
    if (!open) return
    if (channels.length === 0) {
      setSelectedChannel(null)
      return
    }
    setSelectedChannel((current) => {
      if (initialChannel && channels.includes(initialChannel)) return initialChannel
      if (current && channels.includes(current)) return current
      return channels[0]
    })
  }, [open, channels, initialChannel])

  const outputs = query.data?.outputs ?? {}
  const channelPreview = selectedChannel
    ? previewForChannel(selectedChannel, nodes, {
        text: outputs.text ?? "",
        imageUrl: outputs.image?.trim() || null,
        hasTranslation: Boolean(outputs.translatedText?.trim()),
        hasSummary: Boolean(outputs.summary?.trim()),
      })
    : null

  const image = channelPreview?.imageUrl || outputs.image?.trim()
  const channelText = channelPreview?.text || outputs.text
  const text =
    tab === "translated"
      ? outputs.translatedText
      : tab === "summary"
        ? outputs.summary
        : channelText
  const tabs: LangTab[] = [
    "original",
    ...(outputs.translatedText?.trim() ? (["translated"] as const) : []),
    ...(outputs.summary?.trim() ? (["summary"] as const) : []),
  ]
  const status = query.data?.status ?? "draft"
  const done = status === "approved" || status === "rejected"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(CHAT_DIALOG_CONTENT_CLASS, "sm:max-w-3xl")}>
        <ChatDialogHeading
          icon={Eye}
          tone="navy"
          title={<DialogTitle className="text-[15px] font-semibold">{t("contentCard.title")}</DialogTitle>}
          subtitle={
            <DialogDescription className="text-xs">
              {t(`contentCard.status.${status}`, { defaultValue: status })}
            </DialogDescription>
          }
        />
        <ChatDialogBody className="grid gap-5 sm:grid-cols-[1.1fr_1fr]">
          <div className="aspect-[4/3] overflow-hidden rounded-xl bg-canvas-100 dark:bg-navy-800">
            {image ? (
              <FileServiceImage
                url={image}
                alt=""
                className="size-full object-cover"
                loadingClassName="flex size-full items-center justify-center text-xs text-canvas-600 dark:text-navy-200"
              />
            ) : (
              <div className="flex size-full items-center justify-center text-xs text-canvas-600 dark:text-navy-200">
                {query.isLoading ? t("dialogs.loading") : t("dialogs.checkContent.noImage")}
              </div>
            )}
          </div>
          <div className="space-y-3">
            {channels.length > 0 ? (
              <div
                className="flex flex-wrap gap-1"
                role="tablist"
                aria-label={t("contentCard.channelPreview")}
              >
                {channels.map((channel) => {
                  const active = selectedChannel === channel
                  return (
                    <button
                      key={channel}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setSelectedChannel(channel)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors",
                        active
                          ? "border-teal-500/40 bg-teal-50 text-teal-800 dark:border-teal-400/40 dark:bg-teal-400/10 dark:text-teal-200"
                          : "border-canvas-200 dark:border-white/10 bg-canvas-50 dark:bg-navy-800 text-canvas-700 dark:text-navy-200 hover:border-canvas-300",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-3.5 items-center justify-center rounded-full text-[7px] font-bold",
                          LANE_PILL[channel] ?? "bg-muted text-muted-foreground",
                        )}
                        aria-hidden
                      >
                        {channelLabel(channel).slice(0, 2)}
                      </span>
                      {channelLabel(channel)}
                    </button>
                  )
                })}
              </div>
            ) : null}
            {tabs.length > 1 ? (
              <div className="inline-flex rounded-[9px] bg-canvas-100 dark:bg-navy-800 p-0.5">
                {tabs.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTab(key)}
                    className={cn(
                      "rounded-[7px] px-3 py-1 text-xs",
                      tab === key ? "bg-white dark:bg-navy-700 font-medium shadow-sm" : "text-canvas-700 dark:text-navy-200",
                    )}
                  >
                    {t(`dialogs.checkContent.tab.${key}`)}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="space-y-1">
              <p className="text-[11px] font-semibold text-canvas-700 dark:text-navy-200">
                {selectedChannel
                  ? t("dialogs.checkContent.captionForChannel", {
                      channel: channelLabel(selectedChannel),
                    })
                  : t("dialogs.checkContent.caption")}
              </p>
              <p className="max-h-60 overflow-y-auto text-sm whitespace-pre-wrap">
                {text?.trim() || (query.isLoading ? t("dialogs.loading") : "—")}
              </p>
            </div>
          </div>
        </ChatDialogBody>
        <ChatDialogFooter
          start={
            <Button
              variant="ghost"
              className="rounded-[9px] text-[#D64545] hover:bg-[#FDECEC] dark:hover:bg-[#D64545]/12 hover:text-[#D64545]"
              disabled={done}
              onClick={onReject}
            >
              {t("dialogs.actions.reject")}
            </Button>
          }
        >
          <Button variant="outline" className={chatDialogButton.secondary} onClick={onRegenerate}>
            {t("dialogs.actions.regenerate")}
          </Button>
          <Button variant="outline" className={chatDialogButton.secondary} disabled={done} onClick={onEdit}>
            {t("dialogs.actions.edit")}
          </Button>
          <Button className={chatDialogButton.positive} disabled={done} onClick={onApprove}>
            {t("dialogs.actions.approve")}
          </Button>
        </ChatDialogFooter>
      </DialogContent>
    </Dialog>
  )
}
