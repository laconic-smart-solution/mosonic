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
import i18n from "@/i18n"
import { ArrowLeft, Eye } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { UploadChannelTabs } from "@/features/upload/components/upload-channel-tabs"
import { UploadPaletteDragPreview } from "@/features/upload/components/upload-content-palette"
import type { UploadPaletteDragPayload } from "@/features/upload/components/upload-dnd-payload"
import { UploadMediaDropZone } from "@/features/upload/components/upload-media-drop-zone"
import { UploadPreviewDialog } from "@/features/upload/components/upload-preview-dialog"
import { UploadPublishControls } from "@/features/upload/components/upload-publish-controls"
import { UploadTextDropZone } from "@/features/upload/components/upload-text-drop-zone"
import { UploadContentReviewPanel } from "@/features/upload/components/upload-content-review-panel"
import {
  buildSingleChannelPublishRequest,
  createEmptyDraft,
  draftFromUploadRow,
  draftToPatchBody,
  effectiveCaptionForDraft,
  effectiveMediaUrlsForPublish,
  getChannelPublishValidationError,
  type ChannelDraft,
  type WorkflowNodeLayersSnapshot,
} from "@/features/upload/lib/upload-channel-draft"
import {
  isTikTokPhotoMedia,
  TIKTOK_PHOTO_SLIDESHOW_TITLE_MAX,
} from "@/features/upload/lib/tiktok-publish"
import {
  getTabDotStatus,
  type ChannelTabDotStatus,
} from "@/features/upload/lib/upload-channel-ui-status"
import {
  getPlatformMediaConfig,
  mediaTabLabels,
  normalizeChannelKey,
} from "@/features/upload/lib/upload-platform-media"
import {
  buildGlobalPublishRequest,
  getApiErrorMessage,
  isChannelPublishEligible,
} from "@/features/upload/lib/upload-publish.helpers"
import { cn } from "@/lib/utils"
import { useGetContentQuery } from "@/shared/queries/content.query"
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

function normalizeRow(
  c: Partial<UploadChannelRow> & { channel: string }
): UploadChannelRow {
  return {
    channel: c.channel,
    included: c.included ?? true,
    status: (c.status ?? "pending") as UploadChannelRow["status"],
    caption: c.caption ?? "",
    mediaUrl: c.mediaUrl ?? null,
    mediaUrls: c.mediaUrls ?? [],
    youtubeTitle: c.youtubeTitle ?? null,
    scheduledAt: c.scheduledAt ?? null,
    publishedAt: c.publishedAt ?? null,
    failureReason: c.failureReason ?? null,
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
    return normalizeRow({
      caption: "",
      mediaUrl: null,
      mediaUrls: [],
      youtubeTitle: null,
      scheduledAt: null,
      publishedAt: null,
      failureReason: null,
      included: true,
      ...updates,
    })
  }
  return normalizeRow({
    ...base,
    ...updates,
  })
}

const captionLabels: Record<string, string> = {
  text: "Primary text",
  translatedText: "Translation",
  summary: "Summary",
  custom: "Custom",
}

function toDatetimeLocalValue(iso: string | null | undefined) {
  if (!iso) return ""
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

const CANONICAL_UPLOAD_TAB_ORDER = [
  "Facebook",
  "Instagram",
  "Twitter",
  "LinkedIn",
  "YouTube",
  "TikTok",
] as const

function isTwitterFamilyKey(key: string): boolean {
  return key === "twitter" || key === "x"
}

function uploadRowMatchesCanonicalTab(
  canonicalName: string,
  rowChannelKey: string
): boolean {
  const tabKey = normalizeChannelKey(canonicalName)
  const rowKey = rowChannelKey
  if (isTwitterFamilyKey(tabKey) && isTwitterFamilyKey(rowKey)) return true
  return tabKey === rowKey
}

/** Header tabs: only channels on this upload, canonical order then any extra rows. */
function channelTabsForUpload(
  rows: UploadChannelRow[] | undefined
): { channel: string }[] {
  if (!rows?.length) return []
  const tabs: { channel: string }[] = []
  const consumed = new Set<number>()
  for (const name of CANONICAL_UPLOAD_TAB_ORDER) {
    const idx = rows.findIndex(
      (r, i) =>
        !consumed.has(i) &&
        uploadRowMatchesCanonicalTab(name, normalizeChannelKey(r.channel))
    )
    if (idx === -1) continue
    consumed.add(idx)
    tabs.push({ channel: rows[idx]!.channel })
  }
  for (let i = 0; i < rows.length; i++) {
    if (consumed.has(i)) continue
    tabs.push({ channel: rows[i]!.channel })
  }
  return tabs
}

export default function UploadPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { uploadId } = useParams<{ uploadId?: string }>()
  const uploadQuery = useGetUploadQuery(uploadId)
  const upload = uploadQuery.data
  const contentQuery = useGetContentQuery(upload?.contentRef)
  const workflowRuleId = contentQuery.data?.ruleRef
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
  const [showChannelSchedule, setShowChannelSchedule] = useState(false)
  const [scheduledLocalByChannel, setScheduledLocalByChannel] = useState<
    Record<string, string>
  >({})
  const [showGlobalSchedule, setShowGlobalSchedule] = useState(false)
  const [globalScheduledLocal, setGlobalScheduledLocal] = useState("")
  const [workflowLayers, setWorkflowLayers] =
    useState<WorkflowNodeLayersSnapshot | null>(null)
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false)
  const [activeDrag, setActiveDrag] = useState<UploadPaletteDragPayload | null>(
    null
  )

  const globalSchedulePopoverAnchorRef = useRef<HTMLDivElement>(null)
  const channelSchedulePopoverAnchorRef = useRef<HTMLDivElement>(null)

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

  const handleWorkflowLayersChange = useCallback(
    (layers: WorkflowNodeLayersSnapshot) => {
      setWorkflowLayers(layers)
    },
    []
  )

  const channels = useMemo(() => {
    const base = upload?.channels ?? []
    return base.map((row) => {
      const k = row.channel.toLowerCase()
      return normalizeRow(liveStatusByChannel[k] ?? row)
    })
  }, [liveStatusByChannel, upload?.channels])

  const channelTabs = useMemo(
    () => channelTabsForUpload(upload?.channels),
    [upload?.channels]
  )

  /** Zernio may return `x` while upload rows use `twitter`; treat as one connection. */
  const connectedChannelSet = useMemo(() => {
    const set = new Set<string>()
    for (const item of zernioAccountsQuery.data?.accounts ?? []) {
      set.add(item.channel.toLowerCase())
    }
    if (set.has("x")) set.add("twitter")
    if (set.has("twitter")) set.add("x")
    return set
  }, [zernioAccountsQuery.data?.accounts])

  const activeKey = useMemo(() => {
    const tabKeys = new Set(channelTabs.map((t) => t.channel.toLowerCase()))
    if (selectedChannelKey && tabKeys.has(selectedChannelKey)) {
      return selectedChannelKey
    }
    if (!channels.length) {
      return channelTabs[0]?.channel.toLowerCase() ?? ""
    }
    return channels[0]!.channel.toLowerCase()
  }, [channels, selectedChannelKey, channelTabs])

  useEffect(() => {
    setShowChannelSchedule(false)
  }, [activeKey])

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
              upload.resolvedOutputs,
              workflowLayers
            )
          }
        }
        return next
      })
    })
  }, [upload, workflowLayers])

  useEffect(() => {
    if (!upload || !workflowLayers) return
    setDraftsByChannel((prev) => {
      let changed = false
      const next = { ...prev }
      for (const ch of upload.channels) {
        const k = ch.channel.toLowerCase()
        const existing = prev[k]
        if (existing?.dirty) continue
        const hasMedia =
          (existing?.imageUrls.length ?? 0) > 0 ||
          Boolean(existing?.videoUrl?.trim())
        if (hasMedia) continue
        const refreshed = draftFromUploadRow(
          normalizeRow(ch),
          k,
          upload.resolvedOutputs,
          workflowLayers
        )
        if (
          refreshed.imageUrls.length === 0 &&
          !refreshed.videoUrl?.trim()
        ) {
          continue
        }
        next[k] = refreshed
        changed = true
      }
      return changed ? next : prev
    })
  }, [upload, workflowLayers])

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
                currentUpload.resolvedOutputs,
                workflowLayers
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
    const fromChannels = channels.find(
      (c) => c.channel.toLowerCase() === activeKey
    )
    if (fromChannels) return fromChannels

    const live = liveStatusByChannel[activeKey]
    if (live) return normalizeRow(live)

    const tab = channelTabs.find((t) => t.channel.toLowerCase() === activeKey)
    if (!tab || !upload) return undefined
    return normalizeRow({
      channel: tab.channel,
      included: true,
      status: "pending",
      caption: "",
      mediaUrl: null,
      mediaUrls: [],
      youtubeTitle: null,
      scheduledAt: null,
      publishedAt: null,
      failureReason: null,
    })
  }, [channels, activeKey, channelTabs, upload, liveStatusByChannel])

  const activeIsScheduled = activeRow?.status === "scheduled"

  const scheduledLocalForActive =
    scheduledLocalByChannel[activeKey] ??
    toDatetimeLocalValue(activeRow?.scheduledAt)

  const scheduleDirty =
    activeIsScheduled &&
    scheduledLocalForActive !== toDatetimeLocalValue(activeRow?.scheduledAt)

  useEffect(() => {
    if (!activeRow || activeRow.status !== "scheduled") return
    setScheduledLocalByChannel((prev) => {
      if (prev[activeKey]) return prev
      return {
        ...prev,
        [activeKey]: toDatetimeLocalValue(activeRow.scheduledAt),
      }
    })
  }, [activeKey, activeRow?.scheduledAt, activeRow?.status])

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

  const channelRowByKey = useMemo(() => {
    const m = new Map<string, UploadChannelRow>()
    for (const c of channels) {
      m.set(c.channel.toLowerCase(), c)
    }
    return m
  }, [channels])

  const includedByKey = useMemo(() => {
    const out: Record<string, boolean> = {}
    for (const t of channelTabs) {
      const key = t.channel.toLowerCase()
      const row = channelRowByKey.get(key) ?? liveStatusByChannel[key]
      out[key] = row ? Boolean(row.included) : true
    }
    return out
  }, [channelTabs, channelRowByKey, liveStatusByChannel])

  const includeSwitchDisabledByKey = useMemo(() => {
    const out: Record<string, boolean> = {}
    for (const t of channelTabs) {
      const key = t.channel.toLowerCase()
      const row = channelRowByKey.get(key) ?? liveStatusByChannel[key]
      out[key] =
        row?.status === "scheduled" ||
        row?.status === "published" ||
        row?.status === "publishing"
    }
    return out
  }, [channelTabs, channelRowByKey, liveStatusByChannel])

  const eligibleGlobalCount = useMemo(() => {
    let count = 0
    for (const t of channelTabs) {
      const key = t.channel.toLowerCase()
      const row = channelRowByKey.get(key) ?? liveStatusByChannel[key]
      if (!row) continue
      if (!includedByKey[key]) continue
      if (!connectedChannelSet.has(key)) continue
      if (!isChannelPublishEligible(row.status)) continue
      count += 1
    }
    return count
  }, [
    channelTabs,
    channelRowByKey,
    liveStatusByChannel,
    includedByKey,
    connectedChannelSet,
  ])

  const handleChannelIncludedChange = useCallback(
    (channelKey: string, checked: boolean) => {
      if (!uploadId) return
      const channel = channelTabs.find(
        (t) => t.channel.toLowerCase() === channelKey
      )?.channel
      if (!channel) return

      void patchMutation
        .mutateAsync({
          uploadId,
          channel,
          body: { included: checked },
        })
        .then(() => {
          setLiveStatusByChannel((prev) => {
            const fromList = channels.find(
              (c) => c.channel.toLowerCase() === channelKey
            )
            const base =
              prev[channelKey] ??
              fromList ??
              normalizeRow({
                channel,
                included: true,
                status: "pending",
                caption: "",
                mediaUrl: null,
                mediaUrls: [],
                youtubeTitle: null,
                scheduledAt: null,
                publishedAt: null,
                failureReason: null,
              })
            return {
              ...prev,
              [channelKey]: { ...base, included: checked },
            }
          })
          toast.success(
            checked
              ? i18n.t("upload:toast.channelIncluded")
              : i18n.t("upload:toast.channelExcluded"),
          )
        })
        .catch((err) => toast.error(getApiErrorMessage(err)))
    },
    [uploadId, channelTabs, patchMutation, channels]
  )

  const captionEffective = useMemo(() => {
    if (!upload) return ""
    return effectiveCaptionForDraft(
      activeDraft,
      upload.resolvedOutputs,
      workflowLayers
    )
  }, [activeDraft, upload, workflowLayers])

  const dotStatusByKey = useMemo(() => {
    const out: Record<string, ChannelTabDotStatus> = {}
    if (!upload) return out
    const channelRowsByKey = new Map(
      channels.map((c) => [c.channel.toLowerCase(), c])
    )
    for (const t of channelTabs) {
      const key = t.channel.toLowerCase()
      const ch = channelRowsByKey.get(key)
      const connected = connectedChannelSet.has(key)
      if (!ch) {
        const draft = draftsByChannel[key] ?? createEmptyDraft()
        const hasText =
          effectiveCaptionForDraft(
            draft,
            upload.resolvedOutputs,
            workflowLayers
          ).trim().length > 0
        out[key] = getTabDotStatus({
          serverStatus: "pending",
          connected,
          hasAssignedText: hasText,
          isSaved: !draft.dirty,
        })
        continue
      }
      const draft =
        draftsByChannel[key] ??
        draftFromUploadRow(ch, key, upload.resolvedOutputs, workflowLayers)
      const hasText =
        effectiveCaptionForDraft(
          draft,
          upload.resolvedOutputs,
          workflowLayers
        ).trim().length > 0
      out[key] = getTabDotStatus({
        serverStatus: ch.status,
        connected,
        hasAssignedText: hasText,
        isSaved: !draft.dirty,
      })
    }
    return out
  }, [
    channelTabs,
    channels,
    connectedChannelSet,
    draftsByChannel,
    upload,
    workflowLayers,
  ])

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
        captionSourceNodeId: payload.nodeId,
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

  const tiktokPhotoCaptionLimit = useMemo(() => {
    if (!activeRow || !upload || normalizeChannelKey(activeRow.channel) !== "tiktok") {
      return null
    }
    const urls = effectiveMediaUrlsForPublish(
      activeDraft,
      activeRow,
      upload.resolvedOutputs,
      activeKey,
      workflowLayers,
    )
    if (!isTikTokPhotoMedia(urls)) return null
    return TIKTOK_PHOTO_SLIDESHOW_TITLE_MAX
  }, [
    activeRow,
    activeDraft,
    activeKey,
    upload,
    workflowLayers,
  ])

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

  function saveActiveChannel() {
    if (!uploadId || !upload || !activeRow) return
    if (activeIsScheduled) {
      void saveScheduledChannel()
      return
    }
    const body = draftToPatchBody(
      activeRow,
      activeDraft,
      upload.resolvedOutputs,
      workflowLayers
    )
    patchMutation.mutate(
      { uploadId, channel: activeRow.channel, body },
      {
        onSuccess: () => {
          setDraft(activeKey, { dirty: false })
          toast.success(i18n.t("upload:toast.savedChannel"))
        },
        onError: (err) => toast.error(getApiErrorMessage(err)),
      }
    )
  }

  async function saveScheduledChannel() {
    if (!uploadId || !upload || !activeRow || !activeIsScheduled) return
    const patchBody = draftToPatchBody(
      activeRow,
      activeDraft,
      upload.resolvedOutputs,
      workflowLayers
    )
    const caption = patchBody.caption?.trim() ?? ""
    if (!caption) {
      toast.error(i18n.t("upload:toast.captionRequired"))
      return
    }
    const mediaError = getChannelPublishValidationError(
      activeKey,
      caption,
      activeDraft,
      activeRow,
      upload.resolvedOutputs,
      workflowLayers,
      (key, opts) => i18n.t(key, opts)
    )
    if (mediaError) {
      toast.error(mediaError)
      return
    }

    const scheduledLocal = scheduledLocalForActive
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

    const scheduledAt = new Date(scheduledLocal).toISOString()

    try {
      await updateMutation.mutateAsync({
        uploadId,
        body: {
          channel: activeRow.channel,
          caption,
          scheduledAt,
          mediaUrl: patchBody.mediaUrl,
          mediaUrls: patchBody.mediaUrls,
          ...(normalizeChannelKey(activeRow.channel) === "youtube"
            ? { youtubeTitle: patchBody.youtubeTitle }
            : {}),
        },
      })

      setLiveStatusByChannel((prev) => ({
        ...prev,
        [activeKey]: {
          ...(prev[activeKey] ?? activeRow),
          caption,
          scheduledAt,
          mediaUrl: patchBody.mediaUrl ?? null,
          mediaUrls: patchBody.mediaUrls ?? [],
          youtubeTitle:
            normalizeChannelKey(activeRow.channel) === "youtube"
              ? (patchBody.youtubeTitle ?? null)
              : (prev[activeKey] ?? activeRow).youtubeTitle,
        },
      }))
      setDraft(activeKey, { dirty: false })
      toast.success(i18n.t("upload:toast.postUpdated"))
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  async function publishActiveNow(isSchedule: boolean) {
    if (!uploadId || !upload || !activeRow) return
    if (!connectedChannelSet.has(activeKey)) {
      toast.error(i18n.t("upload:toast.connectAccount"))
      return
    }
    const cap = effectiveCaptionForDraft(
      activeDraft,
      upload.resolvedOutputs,
      workflowLayers
    ).trim()
    if (!cap) {
      toast.error(i18n.t("upload:toast.assignCaption"))
      return
    }
    const mediaError = getChannelPublishValidationError(
      activeKey,
      cap,
      activeDraft,
      activeRow,
      upload.resolvedOutputs,
      workflowLayers,
      (key, opts) => i18n.t(key, opts),
    )
    if (mediaError) {
      toast.error(mediaError)
      return
    }
    const channelScheduledLocal = scheduledLocalByChannel[activeKey] ?? ""
    const pubNow = !isSchedule
    if (!pubNow) {
      const badSchedule =
        !channelScheduledLocal.trim() ||
        Number.isNaN(new Date(channelScheduledLocal).getTime()) ||
        new Date(channelScheduledLocal).getTime() <= Date.now()
      if (badSchedule) {
        toast.error(
          channelScheduledLocal.trim()
            ? "Scheduled time must be in the future."
            : "Select a date and time."
        )
        return
      }
    }
    if (pubNow) {
      setShowChannelSchedule(false)
    }
    try {
      if (activeDraft.dirty) {
        const patchBody = draftToPatchBody(
          activeRow,
          activeDraft,
          upload.resolvedOutputs,
          workflowLayers
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
        scheduledLocal: channelScheduledLocal,
      })
      await publishMutation.mutateAsync({ uploadId, body })
      toast.success(
        pubNow ? i18n.t("upload:toast.publishing") : i18n.t("upload:toast.scheduling"),
      )
      setShowChannelSchedule(false)
    } catch (err) {
      toast.error(getApiErrorMessage(err))
    }
  }

  async function publishGlobalNow(isSchedule: boolean) {
    if (!uploadId || !upload) return
    const pubNow = !isSchedule
    if (!pubNow) {
      const badSchedule =
        !globalScheduledLocal.trim() ||
        Number.isNaN(new Date(globalScheduledLocal).getTime()) ||
        new Date(globalScheduledLocal).getTime() <= Date.now()
      if (badSchedule) {
        toast.error(
          globalScheduledLocal.trim()
            ? "Scheduled time must be in the future."
            : "Select a date and time."
        )
        return
      }
    } else {
      setShowGlobalSchedule(false)
    }

    const body = buildGlobalPublishRequest(
      upload,
      includedByKey,
      connectedChannelSet,
      pubNow,
      globalScheduledLocal
    )
    const includedChannels = body.channels.filter((c) => c.included)
    if (includedChannels.length === 0) {
      toast.error(i18n.t("upload:toast.noEligibleChannels"))
      return
    }

    for (const ch of includedChannels) {
      const key = ch.channel.toLowerCase()
      const row = channelRowByKey.get(key) ?? liveStatusByChannel[key]
      if (!row) continue
      const draft =
        draftsByChannel[key] ??
        draftFromUploadRow(row, key, upload.resolvedOutputs, workflowLayers)
      const cap = effectiveCaptionForDraft(
        draft,
        upload.resolvedOutputs,
        workflowLayers
      ).trim()
      if (!cap) {
        toast.error(`Assign caption for ${ch.channel} before publishing.`)
        return
      }
      const mediaError = getChannelPublishValidationError(
        key,
        cap,
        draft,
        row,
        upload.resolvedOutputs,
        workflowLayers,
        (k, opts) => i18n.t(k, opts),
      )
      if (mediaError) {
        toast.error(mediaError)
        return
      }
    }

    if (pubNow) {
      setShowGlobalSchedule(false)
    }

    try {
      for (const ch of includedChannels) {
        const key = ch.channel.toLowerCase()
        const row = channelRowByKey.get(key) ?? liveStatusByChannel[key]
        if (!row) continue
        const draft = draftsByChannel[key]
        if (!draft?.dirty) continue
        const patchBody = draftToPatchBody(
          row,
          draft,
          upload.resolvedOutputs,
          workflowLayers
        )
        await patchMutation.mutateAsync({
          uploadId,
          channel: row.channel,
          body: patchBody,
        })
        setDraft(key, { dirty: false })
      }
      await publishMutation.mutateAsync({ uploadId, body })
      toast.success(
        pubNow ? i18n.t("upload:toast.publishing") : i18n.t("upload:toast.scheduling"),
      )
      setShowGlobalSchedule(false)
    } catch (err) {
      toast.error(getApiErrorMessage(err))
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
      <div className="relative p-6 pt-20">
        {workflowRuleId ? (
          <Button
            onClick={() => navigate(-1)}
            variant="outline"
            className="absolute top-6 left-6 z-70 hover:cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        ) : null}
        <div
          ref={globalSchedulePopoverAnchorRef}
          aria-hidden
          className="pointer-events-none fixed top-20 right-6 z-60 size-px"
        />

        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
          <div className="min-w-0 shrink-0 space-y-1 lg:max-w-[280px]">
            <h1 className="text-base font-medium text-foreground">
              Upload content
            </h1>
          </div>
          {upload ? (
            <UploadPublishControls
              scope="global"
              className="absolute top-8 right-8 w-full min-w-0 flex-1 lg:max-w-none"
              platformLabel="All channels"
              eligibleCount={eligibleGlobalCount}
              schedulePopoverOpen={showGlobalSchedule}
              schedulePopoverAnchorRef={globalSchedulePopoverAnchorRef}
              scheduledLocal={globalScheduledLocal}
              publishPending={
                publishMutation.isPending || updateMutation.isPending
              }
              onPublishNow={() => void publishGlobalNow(false)}
              onScheduleOpenChange={setShowGlobalSchedule}
              onScheduleChange={setGlobalScheduledLocal}
              onConfirmSchedule={() => void publishGlobalNow(true)}
            />
          ) : null}
        </div>

        <UploadChannelTabs
          channels={channelTabs}
          activeKey={activeKey}
          onSelect={(key) => {
            setSelectedChannelKey(key)
            setScheduledEditOpen(false)
          }}
          dotStatusByKey={dotStatusByKey}
          includedByKey={includedByKey}
          onIncludedChange={handleChannelIncludedChange}
          includeSwitchDisabledByKey={includeSwitchDisabledByKey}
          includeSwitchPending={patchMutation.isPending}
        />

        <div className="min-h-[min(520px,70vh)] min-w-0 overflow-hidden">
          <UploadContentReviewPanel
            contentId={upload.contentRef}
            uploadId={uploadId}
            embedInUpload
            generationChannelKeys={channelTabs.map((t) => t.channel)}
            onWorkflowLayersChange={handleWorkflowLayersChange}
            preview={
              <div className="h-full min-w-0 space-y-3 rounded-xl border border-canvas-200 bg-card p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                    Editor
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5 text-xs"
                      disabled={!activeRow || !mediaCfg}
                      onClick={() => setPreviewDialogOpen(true)}
                    >
                      <Eye className="size-3.5" aria-hidden />
                      Preview
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={
                        (!activeIsScheduled && !activeDraft.dirty) ||
                        (activeIsScheduled &&
                          !activeDraft.dirty &&
                          !scheduleDirty) ||
                        patchMutation.isPending ||
                        updateMutation.isPending
                      }
                      className={cn(
                        "h-8 text-xs",
                        (activeDraft.dirty || scheduleDirty) &&
                          "border-primary/50 text-primary",
                      )}
                      onClick={saveActiveChannel}
                    >
                      {activeIsScheduled && updateMutation.isPending
                        ? "Saving…"
                        : "Save"}
                    </Button>
                  </div>
                </div>

                {activeRow && mediaCfg ? (
                  <div className="h-[70vh] space-y-3 overflow-y-auto">
                    {activeIsScheduled ? (
                      <div className="rounded-md border border-[#D7ECFF] bg-[#F3F8FE] px-3 py-2 text-[11px] text-[#185FA5]">
                        {i18n.t("upload:editor.scheduledHint")}
                      </div>
                    ) : null}

                    {activeRow &&
                    mediaCfg &&
                    bannerVariant !== "not_connected" ? (
                      <div className="relative">
                        <div
                          ref={channelSchedulePopoverAnchorRef}
                          aria-hidden
                          className="pointer-events-none absolute top-0 right-0 size-px"
                        />
                        <UploadPublishControls
                          scope="channel"
                          platformLabel={mediaCfg.displayName}
                          serverStatus={activeRow.status}
                          schedulePopoverOpen={showChannelSchedule}
                          schedulePopoverAnchorRef={
                            channelSchedulePopoverAnchorRef
                          }
                          scheduledLocal={scheduledLocalForActive}
                          publishPending={
                            publishMutation.isPending ||
                            updateMutation.isPending
                          }
                          onPublishNow={() => void publishActiveNow(false)}
                          onScheduleOpenChange={setShowChannelSchedule}
                          onScheduleChange={(v) =>
                            setScheduledLocalByChannel((prev) => ({
                              ...prev,
                              [activeKey]: v,
                            }))
                          }
                          onConfirmSchedule={() => void publishActiveNow(true)}
                        />
                      </div>
                    ) : null}

                    {activeIsScheduled ? (
                      <div className="space-y-1.5">
                        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                          {i18n.t("upload:publish.whenToPublish")}
                        </p>
                        <Input
                          type="datetime-local"
                          value={scheduledLocalForActive}
                          onChange={(e) =>
                            setScheduledLocalByChannel((prev) => ({
                              ...prev,
                              [activeKey]: e.target.value,
                            }))
                          }
                          className="h-9 text-xs"
                        />
                      </div>
                    ) : null}

                    <div className="space-y-2">
                      <UploadTextDropZone
                        draft={activeDraft}
                        resolved={upload.resolvedOutputs}
                        workflowLayers={workflowLayers}
                        captionSourceLabel={
                          captionLabels[activeDraft.captionSource] ?? "Text"
                        }
                        captionMaxLength={tiktokPhotoCaptionLimit ?? undefined}
                        captionLimitHint={
                          tiktokPhotoCaptionLimit
                            ? i18n.t("upload:tiktok.slideshowTitleHint")
                            : undefined
                        }
                        activeDrag={activeDrag}
                        onCaptionChange={(next) =>
                          setDraft(activeKey, {
                            captionSource: "custom",
                            captionCustom: next,
                            captionSourceNodeId: undefined,
                            dirty: true,
                          })
                        }
                        onClear={() =>
                          setDraft(activeKey, {
                            captionSource: "text",
                            captionCustom: "",
                            captionSourceNodeId: undefined,
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
                              onClick={() =>
                                setDraft(activeKey, { mediaTab: tab })
                              }
                              className={cn(
                                "flex-1 border-r px-2 py-1.5 text-[11px] transition-colors last:border-r-0",
                                active
                                  ? "bg-muted font-medium text-foreground"
                                  : "bg-background text-muted-foreground hover:bg-muted/50"
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

      {activeRow && mediaCfg ? (
        <UploadPreviewDialog
          open={previewDialogOpen}
          onOpenChange={setPreviewDialogOpen}
          channel={activeRow.channel}
          caption={captionEffective}
          mediaTab={activeDraft.mediaTab}
          imageUrls={activeDraft.imageUrls}
          videoUrl={activeDraft.videoUrl}
          youtubeTitle={activeDraft.youtubeTitle}
          bannerVariant={bannerVariant}
          publishedAt={activeRow.publishedAt}
          scheduledAt={activeRow.scheduledAt}
          onConnect={() => navigate("/settings/accounts")}
          onRetry={retryActiveChannel}
        />
      ) : null}
    </DndContext>
  )
}
