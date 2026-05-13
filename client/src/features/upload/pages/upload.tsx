import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core"
import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { UploadChannelTabs } from "@/features/upload/components/upload-channel-tabs"
import { UploadPaletteDragPreview } from "@/features/upload/components/upload-content-palette"
import type { UploadPaletteDragPayload } from "@/features/upload/components/upload-dnd-payload"
import { UploadMediaDropZone } from "@/features/upload/components/upload-media-drop-zone"
import { UploadPlatformPreview } from "@/features/upload/components/upload-platform-preview"
import { UploadPublishControls } from "@/features/upload/components/upload-publish-controls"
import { UploadStatusBanner } from "@/features/upload/components/upload-status-banner"
import { UploadTextDropZone } from "@/features/upload/components/upload-text-drop-zone"
import { UploadContentReviewPanel } from "@/features/upload/components/upload-content-review-panel"
import {
  buildSingleChannelPublishRequest,
  createEmptyDraft,
  draftFromUploadRow,
  draftToPatchBody,
  effectiveCaptionForDraft,
  type ChannelDraft,
} from "@/features/upload/lib/upload-channel-draft"
import {
  getTabDotStatus,
  type ChannelTabDotStatus,
} from "@/features/upload/lib/upload-channel-ui-status"
import {
  getPlatformMediaConfig,
  mediaTabLabels,
  normalizeChannelKey,
} from "@/features/upload/lib/upload-platform-media"
import { getApiErrorMessage } from "@/features/upload/lib/upload-publish.helpers"
import { cn } from "@/lib/utils"
import {
  usePatchUploadChannelMutation,
  usePublishUploadMutation,
  useGetUploadQuery,
  useUpdateUploadMutation,
} from "@/shared/queries/upload.query"
import { useZernioAccountsQuery } from "@/shared/queries/zernio.query"
import {
  joinUploadRoom,
  leaveUploadRoom,
  onUploadAllCompleted,
  onUploadCompleted,
  onUploadFailed,
  onUploadScheduled,
  onUploadStarted,
  onUploadUpdated,
} from "@/shared/socket/upload-events"
import type { UploadChannelRow, UploadDetail } from "@/shared/types/upload.type"

function normalizeRow(c: UploadChannelRow): UploadChannelRow {
  return {
    ...c,
    caption: c.caption ?? "",
    mediaUrls: c.mediaUrls ?? [],
    youtubeTitle: c.youtubeTitle ?? null,
  }
}

function mergeChannelUpdate(
  channelKey: string,
  prev: UploadChannelRow | undefined,
  uploadData: UploadDetail | undefined,
  updates: Partial<UploadChannelRow> &
    Pick<UploadChannelRow, "channel" | "status">
): UploadChannelRow {
  const base =
    prev ??
    uploadData?.channels.find((c) => c.channel.toLowerCase() === channelKey)
  if (!base) {
    return {
      caption: "",
      mediaUrl: null,
      mediaUrls: [],
      youtubeTitle: null,
      scheduledAt: null,
      publishedAt: null,
      zernioPostId: null,
      failureReason: null,
      ...updates,
    }
  }
  return {
    ...base,
    ...updates,
  }
}

const captionLabels: Record<string, string> = {
  text: "Primary text",
  translatedText: "Translation",
  summary: "Summary",
  custom: "Custom",
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function toDatetimeLocalValue(iso: string | null | undefined) {
  if (!iso) return ""
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

export default function UploadPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { uploadId } = useParams<{ uploadId?: string }>()
  const uploadQuery = useGetUploadQuery(uploadId)
  const upload = uploadQuery.data
  const zernioAccountsQuery = useZernioAccountsQuery(Boolean(uploadId))
  const publishMutation = usePublishUploadMutation()
  const patchMutation = usePatchUploadChannelMutation()
  const updateMutation = useUpdateUploadMutation()

  const [draftsByChannel, setDraftsByChannel] = useState<
    Record<string, ChannelDraft>
  >({})
  const [liveStatusByChannel, setLiveStatusByChannel] = useState<
    Record<string, UploadChannelRow>
  >({})
  const [showSchedule, setShowSchedule] = useState(false)
  const [scheduledLocal, setScheduledLocal] = useState("")
  const [scheduledEditOpen, setScheduledEditOpen] = useState(false)
  const [scheduledEditCaption, setScheduledEditCaption] = useState("")
  const [scheduledEditLocal, setScheduledEditLocal] = useState("")
  const [scheduledEditTitle, setScheduledEditTitle] = useState("")
  const [activeDrag, setActiveDrag] = useState<UploadPaletteDragPayload | null>(
    null
  )
  const [publishAllRunning, setPublishAllRunning] = useState(false)

  const uploadRef = useRef(upload)
  useEffect(() => {
    uploadRef.current = upload
  }, [upload])

  const [selectedChannelKey, setSelectedChannelKey] = useState<string | null>(
    null
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  const channels = useMemo(() => {
    const base = upload?.channels ?? []
    return base.map((row) => {
      const k = row.channel.toLowerCase()
      return normalizeRow(liveStatusByChannel[k] ?? row)
    })
  }, [liveStatusByChannel, upload?.channels])

  const activeKey = useMemo(() => {
    if (!channels.length) return ""
    const keys = new Set(channels.map((c) => c.channel.toLowerCase()))
    if (selectedChannelKey && keys.has(selectedChannelKey)) {
      return selectedChannelKey
    }
    return channels[0]!.channel.toLowerCase()
  }, [channels, selectedChannelKey])

  const connectedChannelSet = useMemo(() => {
    const set = new Set<string>()
    for (const item of zernioAccountsQuery.data?.accounts ?? []) {
      set.add(item.channel.toLowerCase())
    }
    return set
  }, [zernioAccountsQuery.data?.accounts])

  useEffect(() => {
    if (!upload) return
    const next = Object.fromEntries(
      upload.channels.map((ch) => [ch.channel.toLowerCase(), normalizeRow(ch)])
    )
    void Promise.resolve().then(() => setLiveStatusByChannel(next))
  }, [upload])

  useEffect(() => {
    if (!upload) return
    void Promise.resolve().then(() => {
      setDraftsByChannel((prev) => {
        const next: Record<string, ChannelDraft> = {}
        for (const ch of upload.channels) {
          const k = ch.channel.toLowerCase()
          const existing = prev[k]
          if (existing?.dirty) {
            next[k] = existing
          } else {
            next[k] = draftFromUploadRow(
              normalizeRow(ch),
              k,
              upload.resolvedOutputs
            )
          }
        }
        return next
      })
    })
  }, [upload])

  useEffect(() => {
    if (!uploadId) return
    joinUploadRoom(uploadId)
    const cleanups = [
      onUploadStarted((payload) => {
        if (payload.uploadId !== uploadId) return
        const k = payload.channel.toLowerCase()
        setLiveStatusByChannel((prev) => ({
          ...prev,
          [k]: mergeChannelUpdate(k, prev[k], uploadRef.current, {
            channel: payload.channel,
            status: "publishing",
            failureReason: null,
          }),
        }))
      }),
      onUploadCompleted((payload) => {
        if (payload.uploadId !== uploadId) return
        const k = payload.channel.toLowerCase()
        setLiveStatusByChannel((prev) => ({
          ...prev,
          [k]: mergeChannelUpdate(k, prev[k], uploadRef.current, {
            channel: payload.channel,
            status: "published",
            zernioPostId: payload.postId ?? null,
            publishedAt: new Date().toISOString(),
            failureReason: null,
          }),
        }))
      }),
      onUploadFailed((payload) => {
        if (payload.uploadId !== uploadId) return
        const k = payload.channel.toLowerCase()
        setLiveStatusByChannel((prev) => ({
          ...prev,
          [k]: mergeChannelUpdate(k, prev[k], uploadRef.current, {
            channel: payload.channel,
            status: "failed",
            failureReason: payload.message ?? "Failed",
          }),
        }))
      }),
      onUploadScheduled((payload) => {
        if (payload.uploadId !== uploadId) return
        const k = payload.channel.toLowerCase()
        setLiveStatusByChannel((prev) => ({
          ...prev,
          [k]: mergeChannelUpdate(k, prev[k], uploadRef.current, {
            channel: payload.channel,
            status: "scheduled",
            scheduledAt: payload.scheduledAt,
            zernioPostId: payload.postId ?? null,
            failureReason: null,
          }),
        }))
      }),
      onUploadAllCompleted((payload) => {
        if (payload.uploadId !== uploadId) return
        void queryClient.invalidateQueries({ queryKey: ["upload", uploadId] })
      }),
      onUploadUpdated((payload) => {
        if (payload.uploadId !== uploadId) return
        const rows = payload.channels ?? []
        if (!rows.length) {
          void queryClient.invalidateQueries({ queryKey: ["upload", uploadId] })
          return
        }
        setLiveStatusByChannel((prev) => {
          const next = { ...prev }
          for (const row of rows) {
            const k = row.channel.toLowerCase()
            next[k] = normalizeRow(row)
          }
          return next
        })
        const currentUpload = uploadRef.current
        if (currentUpload) {
          setDraftsByChannel((prev) => {
            const next = { ...prev }
            for (const row of rows) {
              const k = row.channel.toLowerCase()
              next[k] = draftFromUploadRow(
                normalizeRow(row),
                k,
                currentUpload.resolvedOutputs
              )
            }
            return next
          })
        }
        void queryClient.invalidateQueries({ queryKey: ["upload", uploadId] })
      }),
    ]
    return () => {
      cleanups.forEach((fn) => fn())
      leaveUploadRoom(uploadId)
    }
  }, [queryClient, uploadId])

  const activeRow = useMemo(() => {
    return channels.find((c) => c.channel.toLowerCase() === activeKey)
  }, [channels, activeKey])

  const activeIsScheduled = activeRow?.status === "scheduled"

  const activeDraft =
    draftsByChannel[activeKey] ??
    (activeRow ? createEmptyDraft() : createEmptyDraft())

  const setDraft = useCallback((key: string, patch: Partial<ChannelDraft>) => {
    setDraftsByChannel((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] ?? createEmptyDraft()),
        ...patch,
        dirty: patch.dirty ?? true,
      },
    }))
  }, [])

  const captionEffective = useMemo(() => {
    if (!upload) return ""
    return effectiveCaptionForDraft(activeDraft, upload.resolvedOutputs)
  }, [activeDraft, upload])

  const dotStatusByKey = useMemo(() => {
    const out: Record<string, ChannelTabDotStatus> = {}
    if (!upload) return out
    for (const ch of channels) {
      const key = ch.channel.toLowerCase()
      const connected = connectedChannelSet.has(key)
      const draft =
        draftsByChannel[key] ??
        draftFromUploadRow(ch, key, upload.resolvedOutputs)
      const hasText =
        effectiveCaptionForDraft(draft, upload.resolvedOutputs).trim().length >
        0
      out[key] = getTabDotStatus({
        serverStatus: ch.status,
        connected,
        hasAssignedText: hasText,
        isSaved: !draft.dirty,
      })
    }
    return out
  }, [channels, connectedChannelSet, draftsByChannel, upload])

  const publishAllVisual = useMemo(() => {
    const connected = channels.filter((c) =>
      connectedChannelSet.has(c.channel.toLowerCase())
    )
    if (connected.length === 0) {
      return { disabled: true, label: "Publish all", ready: false }
    }
    const allDone = connected.every(
      (c) => c.status === "published" || c.status === "scheduled"
    )
    if (allDone) {
      return { disabled: true, label: "All published", ready: false }
    }
    const anyReady = connected.some((c) => {
      const k = c.channel.toLowerCase()
      const dot = dotStatusByKey[k]
      return (
        dot === "ready" && (c.status === "pending" || c.status === "failed")
      )
    })
    if (!anyReady) {
      return { disabled: true, label: "Publish all", ready: false }
    }
    return { disabled: false, label: "Publish all", ready: true }
  }, [channels, connectedChannelSet, dotStatusByKey])

  function handleDragStart(event: DragStartEvent) {
    setActiveDrag(event.active.data.current as UploadPaletteDragPayload)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDrag(null)
    const { over, active } = event
    const payload = active.data.current as UploadPaletteDragPayload | undefined
    if (!over || !payload || !upload || !activeRow) return

    if (over.id === "drop-text") {
      if (payload.kind !== "text") return
      setDraft(activeKey, {
        captionSource: payload.source,
        captionCustom: "",
        dirty: true,
      })
      return
    }

    if (over.id === "drop-media") {
      const cfg = getPlatformMediaConfig(activeKey)
      const draft = draftsByChannel[activeKey] ?? createEmptyDraft()
      const tab = draft.mediaTab

      if (tab === "video") {
        if (payload.kind !== "video") return
        setDraft(activeKey, {
          videoUrl: payload.url,
          imageUrls: [],
          dirty: true,
        })
        return
      }
      if (payload.kind !== "image") return
      if (tab === "single") {
        setDraft(activeKey, {
          imageUrls: [payload.url],
          videoUrl: null,
          dirty: true,
        })
        return
      }
      const next = [...draft.imageUrls]
      if (next.length >= cfg.maxCarousel) {
        toast.error(`Maximum ${cfg.maxCarousel} images for this platform.`)
        return
      }
      next.push(payload.url)
      setDraft(activeKey, { imageUrls: next, videoUrl: null, dirty: true })
    }
  }

  function handleDragCancel() {
    setActiveDrag(null)
  }

  const mediaCfg = activeRow ? getPlatformMediaConfig(activeRow.channel) : null

  const bannerVariant = useMemo(() => {
    if (!activeRow || !mediaCfg) return "hidden" as const
    const connected = connectedChannelSet.has(activeKey)
    if (!connected && activeRow.status === "pending")
      return "not_connected" as const
    if (activeRow.status === "failed") return "failed" as const
    if (activeRow.status === "publishing") return "publishing" as const
    if (activeRow.status === "published") return "published" as const
    if (activeRow.status === "scheduled") return "scheduled" as const
    return "hidden" as const
  }, [activeRow, activeKey, connectedChannelSet, mediaCfg])

  function openScheduledEdit() {
    if (!activeRow) return
    setScheduledEditCaption(captionEffective)
    setScheduledEditLocal(toDatetimeLocalValue(activeRow.scheduledAt))
    setScheduledEditTitle(activeDraft.youtubeTitle)
    setScheduledEditOpen(true)
  }

  function cancelScheduledEdit() {
    setScheduledEditOpen(false)
    if (!activeRow) return
    setScheduledEditCaption(captionEffective)
    setScheduledEditLocal(toDatetimeLocalValue(activeRow.scheduledAt))
    setScheduledEditTitle(activeDraft.youtubeTitle)
  }

  async function confirmScheduledEdit() {
    if (!uploadId || !upload || !activeRow || !activeIsScheduled) return
    const caption = scheduledEditCaption.trim()
    if (!caption) {
      toast.error("Caption is required.")
      return
    }
    const badSchedule =
      !scheduledEditLocal.trim() ||
      Number.isNaN(new Date(scheduledEditLocal).getTime()) ||
      new Date(scheduledEditLocal).getTime() <= Date.now()
    if (badSchedule) {
      toast.error(
        scheduledEditLocal.trim()
          ? "Scheduled time must be in the future."
          : "Select a date and time."
      )
      return
    }

    const scheduledAt = new Date(scheduledEditLocal).toISOString()
    const youtubeTitle =
      normalizeChannelKey(activeRow.channel) === "youtube"
        ? scheduledEditTitle.trim() || null
        : undefined

    try {
      await updateMutation.mutateAsync({
        uploadId,
        body: {
          caption,
          scheduledAt,
          ...(youtubeTitle !== undefined ? { youtubeTitle } : {}),
        },
      })

      setLiveStatusByChannel((prev) => {
        const next = { ...prev }
        for (const row of channels) {
          if (row.status !== "scheduled") continue
          const k = row.channel.toLowerCase()
          next[k] = {
            ...row,
            caption,
            scheduledAt,
            youtubeTitle:
              youtubeTitle !== undefined && k === "youtube"
                ? youtubeTitle
                : row.youtubeTitle,
          }
        }
        return next
      })
      setDraftsByChannel((prev) => {
        const next = { ...prev }
        for (const row of channels) {
          if (row.status !== "scheduled") continue
          const k = row.channel.toLowerCase()
          const draft = next[k] ?? createEmptyDraft()
          next[k] = {
            ...draft,
            captionSource: "custom",
            captionCustom: caption,
            youtubeTitle:
              youtubeTitle !== undefined && k === "youtube"
                ? (youtubeTitle ?? "")
                : draft.youtubeTitle,
            dirty: false,
          }
        }
        return next
      })
      setScheduledEditOpen(false)
      toast.success("Post updated successfully")
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  function saveActiveChannel() {
    if (!uploadId || !upload || !activeRow) return
    const body = draftToPatchBody(
      activeRow,
      activeDraft,
      upload.resolvedOutputs
    )
    patchMutation.mutate(
      { uploadId, channel: activeRow.channel, body },
      {
        onSuccess: () => {
          setDraft(activeKey, { dirty: false })
          toast.success("Saved for this channel")
        },
        onError: (err) => toast.error(getApiErrorMessage(err)),
      }
    )
  }

  async function publishActiveNow(isSchedule: boolean) {
    if (!uploadId || !upload || !activeRow) return
    if (!connectedChannelSet.has(activeKey)) {
      toast.error("Connect this account in Settings first.")
      return
    }
    const cap = effectiveCaptionForDraft(
      activeDraft,
      upload.resolvedOutputs
    ).trim()
    if (!cap) {
      toast.error("Assign caption text before publishing.")
      return
    }
    const pubNow = !isSchedule
    if (!pubNow) {
      const badSchedule =
        !scheduledLocal.trim() ||
        Number.isNaN(new Date(scheduledLocal).getTime()) ||
        new Date(scheduledLocal).getTime() <= Date.now()
      if (badSchedule) {
        toast.error(
          scheduledLocal.trim()
            ? "Scheduled time must be in the future."
            : "Select a date and time."
        )
        return
      }
    }
    try {
      if (activeDraft.dirty) {
        const patchBody = draftToPatchBody(
          activeRow,
          activeDraft,
          upload.resolvedOutputs
        )
        await patchMutation.mutateAsync({
          uploadId,
          channel: activeRow.channel,
          body: patchBody,
        })
        setDraft(activeKey, { dirty: false })
      }
      const body = buildSingleChannelPublishRequest({
        upload,
        channelKey: activeKey,
        connectedSet: connectedChannelSet,
        publishNow: pubNow,
        scheduledLocal,
      })
      await publishMutation.mutateAsync({ uploadId, body })
      toast.success(pubNow ? "Publishing…" : "Scheduling…")
      setShowSchedule(false)
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  async function publishAllSequential() {
    if (!uploadId || !upload || publishAllVisual.disabled || publishAllRunning)
      return
    const targets = channels.filter((c) => {
      const k = c.channel.toLowerCase()
      if (!connectedChannelSet.has(k)) return false
      const dot = dotStatusByKey[k]
      return (
        dot === "ready" && (c.status === "pending" || c.status === "failed")
      )
    })
    if (targets.length === 0) return
    setPublishAllRunning(true)
    try {
      for (const ch of targets) {
        const k = ch.channel.toLowerCase()
        const draft = draftsByChannel[k]
        if (!draft) continue
        const cap = effectiveCaptionForDraft(
          draft,
          upload.resolvedOutputs
        ).trim()
        if (!cap) continue
        if (draft.dirty) {
          const patchBody = draftToPatchBody(ch, draft, upload.resolvedOutputs)
          await patchMutation.mutateAsync({
            uploadId,
            channel: ch.channel,
            body: patchBody,
          })
          setDraftsByChannel((prev) => ({
            ...prev,
            [k]: { ...draft, dirty: false },
          }))
        }
        const body = buildSingleChannelPublishRequest({
          upload,
          channelKey: k,
          connectedSet: connectedChannelSet,
          publishNow: true,
          scheduledLocal: "",
        })
        await publishMutation.mutateAsync({ uploadId, body })
        await delay(400)
      }
      toast.success("Publish all finished.")
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    } finally {
      setPublishAllRunning(false)
    }
  }

  function retryActiveChannel() {
    if (!activeRow) return
    const k = activeRow.channel.toLowerCase()
    setLiveStatusByChannel((prev) => ({
      ...prev,
      [k]: mergeChannelUpdate(k, prev[k], uploadRef.current, {
        channel: activeRow.channel,
        status: "pending",
        failureReason: null,
      }),
    }))
  }

  if (!uploadId) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Missing upload id.
      </div>
    )
  }

  if (uploadQuery.isLoading || zernioAccountsQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Spinner className="size-4" />
        Loading upload…
      </div>
    )
  }

  if (uploadQuery.isError || !upload) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTitle>Could not load upload</AlertTitle>
          <AlertDescription>
            {getApiErrorMessage(uploadQuery.error)}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-base font-medium text-foreground">
            Upload content
          </h1>
          <Button
            type="button"
            size="sm"
            disabled={
              publishAllVisual.disabled ||
              publishMutation.isPending ||
              publishAllRunning
            }
            className={
              publishAllVisual.ready
                ? "border-[#1D9E75] bg-[#E1F5EE] text-[#0F6E56] hover:bg-[#D4EFE4]"
                : undefined
            }
            variant={publishAllVisual.ready ? "outline" : "secondary"}
            onClick={() => void publishAllSequential()}
          >
            {publishAllRunning || publishMutation.isPending
              ? "Publishing…"
              : publishAllVisual.label}
          </Button>
        </div>

        <UploadChannelTabs
          channels={channels}
          activeKey={activeKey}
          onSelect={(key) => {
            setSelectedChannelKey(key)
            setScheduledEditOpen(false)
          }}
          dotStatusByKey={dotStatusByKey}
        />

        <div className="min-h-[min(520px,70vh)] min-w-0 overflow-hidden">
          <UploadContentReviewPanel
            contentId={upload.contentRef}
            uploadId={uploadId}
            embedInUpload
            channelPreview={
              activeRow && mediaCfg ? (
                <>
                  <UploadStatusBanner
                    platformLabel={mediaCfg.displayName}
                    variant={bannerVariant}
                    publishedAt={activeRow.publishedAt}
                    scheduledAt={activeRow.scheduledAt}
                    onConnect={() => navigate("/settings/accounts")}
                    onRetry={retryActiveChannel}
                  />
                  <UploadPlatformPreview
                    channel={activeRow.channel}
                    caption={captionEffective}
                    mediaTab={activeDraft.mediaTab}
                    imageUrls={activeDraft.imageUrls}
                    videoUrl={activeDraft.videoUrl}
                    youtubeTitle={activeDraft.youtubeTitle}
                  />
                </>
              ) : null
            }
            preview={
              <div className="h-full min-w-0 space-y-3 rounded-xl border border-canvas-200 bg-card p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                    Preview
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={
                      activeIsScheduled ||
                      !activeDraft.dirty ||
                      patchMutation.isPending
                    }
                    className={cn(
                      "h-8 text-xs",
                      activeDraft.dirty &&
                        !activeIsScheduled &&
                        "border-primary/50 text-primary"
                    )}
                    onClick={saveActiveChannel}
                  >
                    Save
                  </Button>
                </div>

                {activeRow && mediaCfg ? (
                  <div className="h-[70vh] space-y-3 overflow-y-auto">
                    {activeIsScheduled && scheduledEditOpen ? (
                      <div className="space-y-3 rounded-lg border border-[#D7ECFF] bg-[#F3F8FE] p-3">
                        <div>
                          <p className="text-xs font-semibold text-[#042C53]">
                            Edit scheduled post
                          </p>
                          <p className="mt-1 text-[11px] text-[#185FA5]">
                            Changes apply to all scheduled channels for this
                            upload. Media and platform cannot be changed after
                            scheduling.
                          </p>
                        </div>
                        <div className="space-y-1.5">
                          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                            Caption
                          </p>
                          <Textarea
                            value={scheduledEditCaption}
                            onChange={(e) =>
                              setScheduledEditCaption(e.target.value)
                            }
                            className="min-h-[120px] resize-y bg-background text-xs"
                            placeholder="Update caption for scheduled channels"
                          />
                        </div>
                        {normalizeChannelKey(activeRow.channel) ===
                        "youtube" ? (
                          <div className="space-y-1.5">
                            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                              YouTube title
                            </p>
                            <Input
                              value={scheduledEditTitle}
                              onChange={(e) =>
                                setScheduledEditTitle(e.target.value)
                              }
                              className="h-9 bg-background text-xs"
                              placeholder="Update YouTube video title"
                            />
                          </div>
                        ) : null}
                        <div className="space-y-1.5">
                          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                            Reschedule to
                          </p>
                          <Input
                            type="datetime-local"
                            value={scheduledEditLocal}
                            onChange={(e) =>
                              setScheduledEditLocal(e.target.value)
                            }
                            className="h-9 bg-background text-xs"
                          />
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={updateMutation.isPending}
                            onClick={cancelScheduledEdit}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            disabled={updateMutation.isPending}
                            onClick={() => void confirmScheduledEdit()}
                          >
                            {updateMutation.isPending
                              ? "Updating..."
                              : "Confirm changes"}
                          </Button>
                        </div>
                      </div>
                    ) : null}

                    {activeIsScheduled && !scheduledEditOpen ? (
                      <div className="rounded-md border bg-muted/40 p-3 text-[11px] text-muted-foreground">
                        This post is scheduled. Use Edit scheduled post to
                        update the caption, schedule time, or YouTube title.
                        Media changes are not supported by Zernio.
                      </div>
                    ) : null}

                    <div className="space-y-2">
                      <UploadTextDropZone
                        draft={activeDraft}
                        resolved={upload.resolvedOutputs}
                        captionSourceLabel={
                          captionLabels[activeDraft.captionSource] ?? "Text"
                        }
                        activeDrag={activeDrag}
                        disabled={activeIsScheduled}
                        onCaptionChange={(next) =>
                          setDraft(activeKey, {
                            captionSource: "custom",
                            captionCustom: next,
                            dirty: true,
                          })
                        }
                        onClear={() =>
                          setDraft(activeKey, {
                            captionSource: "text",
                            captionCustom: "",
                            dirty: true,
                          })
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                        Media
                      </p>
                      <div className="flex overflow-hidden rounded-md border">
                        {mediaCfg.tabs.map((tab) => {
                          const active = activeDraft.mediaTab === tab
                          return (
                            <button
                              key={tab}
                              type="button"
                              disabled={activeIsScheduled}
                              onClick={() =>
                                setDraft(activeKey, { mediaTab: tab })
                              }
                              className={cn(
                                "flex-1 border-r px-2 py-1.5 text-[11px] transition-colors last:border-r-0",
                                active
                                  ? "bg-muted font-medium text-foreground"
                                  : "bg-background text-muted-foreground hover:bg-muted/50",
                                activeIsScheduled &&
                                  "cursor-not-allowed opacity-60 hover:bg-background"
                              )}
                            >
                              {mediaTabLabels(tab)}
                            </button>
                          )
                        })}
                      </div>
                      <UploadMediaDropZone
                        mode={activeDraft.mediaTab}
                        imageUrls={activeDraft.imageUrls}
                        videoUrl={activeDraft.videoUrl}
                        maxImages={mediaCfg.maxCarousel}
                        activeDrag={activeDrag}
                        disabled={activeIsScheduled}
                        onRemoveImage={(i) => {
                          const next = activeDraft.imageUrls.filter(
                            (_, j) => j !== i
                          )
                          setDraft(activeKey, { imageUrls: next, dirty: true })
                        }}
                        onClear={() =>
                          setDraft(activeKey, {
                            imageUrls: [],
                            videoUrl: null,
                            dirty: true,
                          })
                        }
                        onUploadedUrls={(urls) => {
                          const tab = activeDraft.mediaTab
                          if (tab === "video") {
                            setDraft(activeKey, {
                              videoUrl: urls[0] ?? null,
                              imageUrls: [],
                              dirty: true,
                            })
                            return
                          }
                          if (tab === "single") {
                            setDraft(activeKey, {
                              imageUrls: urls.slice(0, 1),
                              videoUrl: null,
                              dirty: true,
                            })
                            return
                          }
                          const merged = [
                            ...activeDraft.imageUrls,
                            ...urls,
                          ].slice(0, mediaCfg.maxCarousel)
                          setDraft(activeKey, {
                            imageUrls: merged,
                            videoUrl: null,
                            dirty: true,
                          })
                        }}
                      />
                    </div>

                    {normalizeChannelKey(activeRow.channel) === "youtube" ? (
                      <div className="space-y-2">
                        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                          Video title
                        </p>
                        <Input
                          value={activeDraft.youtubeTitle}
                          disabled={activeIsScheduled}
                          onChange={(e) =>
                            setDraft(activeKey, {
                              youtubeTitle: e.target.value,
                            })
                          }
                          placeholder="Enter YouTube video title…"
                          className="text-xs"
                        />
                      </div>
                    ) : null}

                    {bannerVariant === "not_connected" ? null : (
                      <UploadPublishControls
                        platformLabel={mediaCfg.displayName}
                        serverStatus={activeRow.status}
                        showSchedule={showSchedule}
                        scheduledLocal={scheduledLocal}
                        publishPending={
                          publishMutation.isPending || updateMutation.isPending
                        }
                        onPublishNow={() => publishActiveNow(false)}
                        onToggleSchedule={() => setShowSchedule((s) => !s)}
                        onScheduleChange={setScheduledLocal}
                        onConfirmSchedule={() => publishActiveNow(true)}
                        onEditScheduled={openScheduledEdit}
                      />
                    )}
                  </div>
                ) : null}
              </div>
            }
          />
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeDrag ? (
          <UploadPaletteDragPreview
            payload={activeDrag}
            resolved={upload.resolvedOutputs}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
