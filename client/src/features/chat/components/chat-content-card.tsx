import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { FileText, ImageIcon, Loader2, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { FileServiceImage } from "@/features/upload/components/upload-display-media"
import { channelLabel } from "@/shared/constants/distribution-channels"
import { contentService } from "@/shared/services/content.service"
import {
  joinContentRoom,
  leaveContentRoom,
  onContentNodeFailedFinal,
  onContentNodeRerunCompleted,
} from "@/shared/socket/content-events"
import { useChatActions } from "../hooks/use-chat-actions"
import {
  collectContentChannels,
  previewForChannel,
  type ContentDraftNode,
} from "../lib/content-channel-preview"
import type { ContentCardSnapshot } from "../lib/parse-content-card"
import {
  contentCardPendingTitleKey,
  contentCardWorkingKey,
  imageUrlFromNodeOutput,
  nodeStillPending,
} from "../lib/rerun-node-label"
import { ChatApproveContentDialog } from "./dialogs/chat-approve-content-dialog"
import { ChatCheckContentDialog } from "./dialogs/chat-check-content-dialog"
import { ChatEditContentDialog } from "./dialogs/chat-edit-content-dialog"
import { ChatRejectContentDialog } from "./dialogs/chat-reject-content-dialog"
import { chatDialogButton } from "../lib/chat-dialog-styles"

type ContentDialog = "check" | "approve" | "edit" | "reject" | null

const POLL_MS = 3000
const POLL_LIMIT_MS = 180_000
const PENDING_ACTIONS = new Set(["generate_more_started", "content_rerun_started"])

const LANE_PILL: Record<string, string> = {
  instagram: "bg-gradient-to-br from-pink-500 to-fuchsia-700 text-white",
  facebook: "bg-[#1877F2] text-white",
  linkedin: "bg-[#0A66C2] text-white",
  youtube: "bg-[#FF0000] text-white",
  tiktok: "bg-neutral-950 text-white",
  rednote: "bg-[#FF2442] text-white",
}

function previewFromDetail(data: {
  contentId: string
  pipelineRef: string
  workflowRef: string
  status: string
  outputs?: {
    text?: string
    translatedText?: string
    summary?: string
    image?: string
    video?: string
  }
  nodeOutputs?: Record<string, Record<string, unknown> | undefined>
  lanes?: string[]
  nodes?: ContentDraftNode[]
}): ContentCardSnapshot {
  const outputs = data.outputs ?? {}
  const nodeHas = (field: "image" | "video") =>
    Object.values(data.nodeOutputs ?? {}).some((entry) => {
      const value = entry?.[field]
      return typeof value === "string" && value.trim().length > 0
    })
  return {
    action: "show_content",
    contentId: data.contentId,
    pipelineId: data.pipelineRef,
    workflowId: data.workflowRef,
    status: data.status,
    textPreview: outputs.text ?? "",
    translatedPreview: outputs.translatedText ?? "",
    summaryPreview: outputs.summary ?? "",
    hasImage: Boolean(outputs.image?.trim()) || nodeHas("image"),
    hasVideo: Boolean(outputs.video?.trim()) || nodeHas("video"),
    hasTranslation: Boolean(outputs.translatedText?.trim()),
    hasSummary: Boolean(outputs.summary?.trim()),
    pendingNodeId: null,
    pendingNodeType: null,
    saved: false,
    rejectReason: null,
    lanes: Array.isArray(data.lanes) ? data.lanes : [],
    nodes: Array.isArray(data.nodes) ? data.nodes : [],
  }
}

export function ChatContentCard({ snapshot }: { snapshot: ContentCardSnapshot }) {
  const { t } = useTranslation("chat")
  const [view, setView] = useState(snapshot)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [timedOut, setTimedOut] = useState(false)
  const [dialog, setDialog] = useState<ContentDialog>(null)
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null)
  const chatActions = useChatActions()

  // Stable catalog fingerprint — new array refs from re-parse must not retrigger.
  const catalogKey = `${snapshot.lanes.join(",")}|${snapshot.nodes
    .map((n) => `${n.nodeId}:${n.field}:${n.preview.length}`)
    .join(",")}`

  // Sync observation fields. Depend on primitives + catalogKey — not array/object
  // identity. Parent re-parses steps on scroll; new [] refs used to clear imageUrl.
  useEffect(() => {
    setView((prev) => {
      const same = prev.contentId === snapshot.contentId
      return {
        ...snapshot,
        lanes: snapshot.lanes.length > 0 ? snapshot.lanes : same ? prev.lanes : [],
        nodes: snapshot.nodes.length > 0 ? snapshot.nodes : same ? prev.nodes : [],
        rejectReason: snapshot.rejectReason ?? (same ? prev.rejectReason : null),
      }
    })
    setTimedOut(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- catalogKey stands in for lanes/nodes
  }, [
    snapshot.contentId,
    snapshot.action,
    snapshot.status,
    snapshot.pendingNodeId,
    snapshot.pendingNodeType,
    snapshot.textPreview,
    snapshot.translatedPreview,
    snapshot.summaryPreview,
    snapshot.saved,
    snapshot.hasImage,
    snapshot.hasVideo,
    snapshot.hasTranslation,
    snapshot.hasSummary,
    snapshot.rejectReason,
    catalogKey,
  ])

  // Reset resolved image only when switching drafts.
  useEffect(() => {
    setImageUrl(null)
  }, [snapshot.contentId])

  // Hydrate channel catalog + image URL from content detail.
  useEffect(() => {
    let cancelled = false
    void contentService
      .getById(snapshot.contentId)
      .then((data) => {
        if (cancelled) return
        const next = previewFromDetail(data)
        setView((v) => ({
          ...next,
          action: PENDING_ACTIONS.has(v.action) ? v.action : next.action,
          pendingNodeId: v.pendingNodeId,
          pendingNodeType: v.pendingNodeType,
          rejectReason: v.rejectReason,
          textPreview: next.textPreview || v.textPreview,
          lanes: next.lanes.length > 0 ? next.lanes : v.lanes,
          nodes: next.nodes.length > 0 ? next.nodes : v.nodes,
        }))
        const trunkImage =
          typeof data.outputs?.image === "string" ? data.outputs.image.trim() : null
        if (trunkImage) {
          setImageUrl(trunkImage)
          return
        }
        const fromNode = next.nodes.find((n) => {
          if (n.field !== "image") return false
          const preview = n.preview.trim()
          return (
            /^https?:\/\//i.test(preview) ||
            preview.startsWith("/") ||
            preview.startsWith("data:")
          )
        })
        if (fromNode) setImageUrl(fromNode.preview.trim())
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [snapshot.contentId])

  useEffect(() => {
    if (!PENDING_ACTIONS.has(view.action)) return
    let cancelled = false
    const started = Date.now()
    const contentId = view.contentId
    const pendingId = view.pendingNodeId
    const pendingType = view.pendingNodeType

    joinContentRoom(contentId)

    const markReady = (nextImage?: string | null) => {
      if (cancelled) return
      setView((v) => ({
        ...v,
        action: "show_content",
        pendingNodeId: null,
        pendingNodeType: null,
        hasImage: nextImage ? true : v.hasImage,
      }))
      if (nextImage) setImageUrl(nextImage)
    }

    const unsubDone = onContentNodeRerunCompleted((payload) => {
      if (payload.contentId !== contentId) return
      if (pendingId && payload.nodeId !== pendingId) return
      const url =
        typeof payload.output?.image === "string" ? payload.output.image.trim() : null
      markReady(url || null)
    })
    const unsubFail = onContentNodeFailedFinal((payload) => {
      if (payload.contentId !== contentId) return
      if (pendingId && payload.nodeId !== pendingId) return
      markReady(null)
    })

    const tick = async () => {
      if (Date.now() - started > POLL_LIMIT_MS) {
        if (!cancelled) setTimedOut(true)
        return false
      }
      try {
        const data = await contentService.getById(contentId)
        if (cancelled) return false
        const stillPending = pendingId
          ? nodeStillPending(data.nodeOutputs, pendingId)
          : false
        const nextUrl =
          imageUrlFromNodeOutput(data.nodeOutputs, pendingId) ??
          (typeof data.outputs?.image === "string" ? data.outputs.image.trim() : null)
        if (stillPending) {
          const next = previewFromDetail(data)
          setView((v) => ({
            ...next,
            rejectReason: v.rejectReason,
            pendingNodeId: pendingId,
            pendingNodeType: pendingType,
            action: v.action,
            lanes: next.lanes.length ? next.lanes : v.lanes,
            nodes: next.nodes.length ? next.nodes : v.nodes,
          }))
          return false
        }
        setView({
          ...previewFromDetail(data),
          rejectReason: view.rejectReason,
          pendingNodeId: null,
          pendingNodeType: null,
          action: "show_content",
        })
        if (nextUrl) setImageUrl(nextUrl)
        return true
      } catch {
        return false
      }
    }

    void tick()
    const timer = setInterval(() => {
      void tick().then((done) => {
        if (done) clearInterval(timer)
      })
    }, POLL_MS)

    return () => {
      cancelled = true
      clearInterval(timer)
      unsubDone()
      unsubFail()
      leaveContentRoom(contentId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- poll while this pending job is active
  }, [view.action, view.contentId, view.pendingNodeId, view.pendingNodeType])

  const channels = useMemo(
    () => collectContentChannels(view.lanes, view.nodes),
    [view.lanes, view.nodes],
  )

  useEffect(() => {
    if (channels.length === 0) {
      setSelectedChannel(null)
      return
    }
    setSelectedChannel((current) =>
      current && channels.includes(current) ? current : channels[0],
    )
  }, [channels])

  const channelPreview = useMemo(() => {
    if (!selectedChannel) return null
    return previewForChannel(selectedChannel, view.nodes, {
      text: view.textPreview,
      imageUrl,
      hasTranslation: view.hasTranslation,
      hasSummary: view.hasSummary,
    })
  }, [selectedChannel, view.nodes, view.textPreview, view.hasTranslation, view.hasSummary, imageUrl])

  const displayText = channelPreview?.text || view.textPreview
  const displayImage = channelPreview?.imageUrl || imageUrl
  const statusKey = ["draft", "in_review", "approved", "rejected"].includes(view.status)
    ? view.status
    : "unknown"
  const flags = [
    (channelPreview ? Boolean(channelPreview.imageUrl) : view.hasImage)
      ? t("contentCard.hasImage")
      : null,
    view.hasVideo ? t("contentCard.hasVideo") : null,
    (channelPreview?.hasTranslation ?? view.hasTranslation)
      ? t("contentCard.hasTranslation")
      : null,
    (channelPreview?.hasSummary ?? view.hasSummary) ? t("contentCard.hasSummary") : null,
  ].filter(Boolean)

  const rejected = view.status === "rejected"
  const decided = view.status === "approved" || rejected
  const pending = PENDING_ACTIONS.has(view.action)
  const isImageJob = view.pendingNodeType === "image_generation"
  const TitleIcon = isImageJob ? ImageIcon : FileText
  const closeDialog = (open: boolean) => {
    if (!open) setDialog(null)
  }

  function regenerate() {
    setDialog(null)
    chatActions?.sendMessage(t("contentCard.regenerateMessage", { contentId: view.contentId }))
  }

  function makeNewVersion() {
    setDialog(null)
    chatActions?.sendMessage(
      view.rejectReason
        ? t("contentCard.newVersionMessageWithReason", { contentId: view.contentId, reason: view.rejectReason })
        : t("contentCard.newVersionMessage", { contentId: view.contentId }),
    )
  }

  return (
    <div
      className={cn(
        "w-full space-y-2.5 rounded-2xl border border-canvas-200 dark:border-white/8 bg-white dark:bg-navy-700 p-3",
        rejected && "border-[#D64545]/40 dark:border-[#D64545]/40",
      )}
    >
      <div
        role="button"
        tabIndex={0}
        className="cursor-pointer space-y-1.5 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
        onClick={() => setDialog("check")}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            setDialog("check")
          }
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-navy-700 dark:text-[#E8EDF6]">
              <TitleIcon className="size-3.5 shrink-0" aria-hidden />
              {t(contentCardPendingTitleKey(pending ? view.pendingNodeType : null))}
            </p>
            {rejected ? (
              <span className="mt-1 inline-flex items-center rounded-full bg-[#FDECEC] dark:bg-[#D64545]/12 px-2 py-0.5 text-[11px] font-semibold text-[#D64545]">
                {t("contentCard.status.rejected")}
              </span>
            ) : (
              <p className="text-[11px] text-muted-foreground">{t(`contentCard.status.${statusKey}`)}</p>
            )}
          </div>
          <Link
            to={`/content/${view.contentId}`}
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 text-[11px] font-medium text-navy-500 dark:text-navy-200 underline-offset-2 hover:underline"
          >
            {t("contentCard.openContent")}
          </Link>
        </div>

        {channels.length > 0 ? (
          <div
            className="flex flex-wrap gap-1"
            role="tablist"
            aria-label={t("contentCard.channelPreview")}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
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

        {rejected && view.rejectReason ? (
          <p className="text-xs text-[#D64545]">
            {t("contentCard.rejectedReason", { reason: view.rejectReason })}
          </p>
        ) : null}
        {displayText ? (
          <p className="line-clamp-3 text-xs text-canvas-700 dark:text-navy-200">{displayText}</p>
        ) : null}
        {pending && isImageJob ? (
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-canvas-200 dark:border-white/10 bg-canvas-50/80 dark:bg-navy-800/50 px-3 py-6">
            <Loader2 className="size-4 shrink-0 animate-spin text-teal-500" aria-hidden />
            <p className="text-[12px] text-muted-foreground">{t(contentCardWorkingKey(view.pendingNodeType))}</p>
          </div>
        ) : null}
        {!pending && displayImage ? (
          <FileServiceImage
            url={displayImage}
            alt=""
            className="max-h-40 w-full rounded-xl object-cover"
            loadingClassName="flex max-h-40 min-h-24 w-full items-center justify-center rounded-xl bg-canvas-50 dark:bg-navy-800 text-[11px] text-muted-foreground"
          />
        ) : null}
        {!pending && flags.length > 0 ? (
          <p className="text-[11px] text-muted-foreground">{flags.join(" · ")}</p>
        ) : null}
        {pending && !isImageJob ? (
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Loader2 className="size-3 animate-spin" aria-hidden />
            {t(contentCardWorkingKey(view.pendingNodeType))}
          </p>
        ) : null}
        {timedOut && pending ? (
          <p className="text-[11px] text-muted-foreground">{t("contentCard.stillWorking")}</p>
        ) : null}
      </div>
      {rejected ? (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            className={chatDialogButton.primary}
            disabled={pending || !chatActions || chatActions.busy}
            onClick={makeNewVersion}
          >
            <RefreshCw data-icon="inline-start" />
            {t("contentCard.makeNewVersion")}
          </Button>
        </div>
      ) : null}
      {!decided ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" className={chatDialogButton.positive} disabled={pending} onClick={() => setDialog("approve")}>
            {t("dialogs.actions.approve")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className={chatDialogButton.secondary}
            disabled={pending}
            onClick={() => setDialog("edit")}
          >
            {t("dialogs.actions.edit")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className={cn(chatDialogButton.secondary)}
            disabled={pending || !chatActions || chatActions.busy}
            onClick={regenerate}
          >
            {t("dialogs.actions.regenerate")}
          </Button>
        </div>
      ) : null}

      <ChatCheckContentDialog
        open={dialog === "check"}
        onOpenChange={closeDialog}
        contentId={view.contentId}
        initialChannel={selectedChannel}
        onApprove={() => setDialog("approve")}
        onEdit={() => setDialog("edit")}
        onReject={() => setDialog("reject")}
        onRegenerate={regenerate}
      />
      <ChatApproveContentDialog
        open={dialog === "approve"}
        onOpenChange={closeDialog}
        contentId={view.contentId}
        preview={displayText}
        onApproved={() => setView((v) => ({ ...v, status: "approved" }))}
      />
      <ChatEditContentDialog open={dialog === "edit"} onOpenChange={closeDialog} contentId={view.contentId} />
      <ChatRejectContentDialog
        open={dialog === "reject"}
        onOpenChange={closeDialog}
        contentId={view.contentId}
        onRejected={({ reasons, note, remember }) => {
          const reason = [...reasons, note.trim()].filter(Boolean).join("; ")
          setView((v) => ({ ...v, status: "rejected", rejectReason: reason || v.rejectReason }))
          if (reason && chatActions && !chatActions.busy) {
            chatActions.sendMessage(
              t(remember ? "contentCard.rejectReasonRemember" : "contentCard.rejectReason", { reason }),
            )
          }
        }}
      />
    </div>
  )
}
