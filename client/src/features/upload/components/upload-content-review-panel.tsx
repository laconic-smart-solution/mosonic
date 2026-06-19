import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { useNavigate } from "react-router-dom"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import i18n from "@/i18n"
import { toastApiError } from "@/shared/lib/toast-error"
import { motion } from "framer-motion"
import { Sparkles } from "lucide-react"

import { CreditUsageBadge } from "@/components/core/credit-usage-badge"
import { useSetBreadcrumbLabel } from "@/components/app/breadcrumb-override.context"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { TooltipProvider } from "@/components/ui/tooltip"
import { WorkflowNodeConfigFields } from "@/features/workflow/components/workflow-node-config-fields"
import { WorkflowNodeGuideSection } from "@/features/workflow/components/workflow-node-guide-section"
import {
  backendTypeToCanvas,
  buildGenerateMoreDefaultConfig,
  type GenerateMoreRuleHint,
} from "@/features/workflow/data/workflow-model"
import { randomUuid } from "@/lib/random-uuid"

import {
  type OutputKey,
  flattenWorkflowNodesToFlatOutputs,
  lastNodeIdForOutputKey,
  mergeNodeOutputLayers,
  outputKeyForNodeType,
} from "@/features/content/data/content-review-helpers"
import { buildGenerationNodesForContent } from "@/features/upload/lib/upload-generation-nodes"
import {
  filterGenerationNodesForChannel,
  staticTextFromLayer,
  type GenerationLaneFilter,
} from "@/features/upload/lib/upload-generation-lane"
import {
  getPlatformMediaConfig,
  normalizeChannelKey,
} from "@/features/upload/lib/upload-platform-media"
import { ContentDetailNodeCard } from "@/features/content/components/content-detail/content-detail-node-card"
import {
  ContentDetailConfirmDialogs,
  ContentDetailImageLightbox,
  ContentDetailRerunSheet,
} from "@/features/content/components/content-detail/content-detail-overlays"
import { ContentNewsSourceBanner } from "@/features/content/components/content-detail/content-news-source-banner"
import { ContentDetailReviewHeader } from "@/features/content/components/content-detail/content-detail-review-header"
import { ContentDetailReviewSidebar } from "@/features/content/components/content-detail/content-detail-review-sidebar"
import {
  emptyRunState,
  isNonEmptyOutput,
  PipelineTypeIcon,
  pipelineStepLabel,
} from "@/features/content/components/content-detail/content-detail-review-ui"
import { useGetContentQuery } from "@/shared/queries/content.query"
import { useRuleByIdQuery } from "@/shared/queries/rule.query"
import { useGetPipelineQuery } from "@/shared/queries/pipeline.query"
import { useGetWorkflowQuery } from "@/shared/queries/workflow.query"
import { contentService } from "@/shared/services/content.service"
import { uploadService } from "@/shared/services/upload.service"
import { uploadMediaService } from "@/shared/services/upload-media.service"
import type { ContentDetail } from "@/shared/types/content.type"
import type { WorkflowNodeType } from "@/shared/types/workflow.type"
import {
  joinContentRoom,
  leaveContentRoom,
  onContentNodeFailedFinal,
  onContentNodeProcessing,
  onContentNodeRetrying,
  onContentNodeRerunCompleted,
  onContentNodeStarted,
  onContentNodeStreaming,
} from "@/shared/socket/content-events"

import { UploadGenerationDraggableCard } from "@/features/upload/components/upload-generation-draggable-card"
import type { WorkflowNodeLayersSnapshot } from "@/features/upload/lib/upload-channel-draft"

export type UploadContentReviewPanelProps = {
  contentId: string | undefined
  /** Current upload route id — used to invalidate publish workspace after save/approve */
  uploadId?: string
  /** When true, approving stays on this page and hides redundant “Continue to upload” */
  embedInUpload?: boolean
  /** Middle column when embedded in the Upload workspace (caption, media, publish) */
  preview?: ReactNode
  /** Fired whenever per-node outputs / edits change (used to resolve pinned drag-drop captions). */
  onWorkflowLayersChange?: (layers: WorkflowNodeLayersSnapshot) => void
  /** Channel keys (tabs) to show in Generated contents header filter. */
  generationChannelKeys?: string[]
  /** Default selected Generated contents filter tab. */
  generationDefaultKey?: GenerationLaneFilter
}

export function UploadContentReviewPanel({
  contentId,
  uploadId,
  embedInUpload = false,
  preview,
  onWorkflowLayersChange,
  generationChannelKeys,
  generationDefaultKey = "all",
}: UploadContentReviewPanelProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const contentQuery = useGetContentQuery(contentId)
  const data = contentQuery.data

  const ruleQuery = useRuleByIdQuery<GenerateMoreRuleHint>(data?.ruleRef)
  const ruleHint = ruleQuery.data

  const workflowQuery = useGetWorkflowQuery(data?.workflowRef)
  const workflowNodes = useMemo(
    () => workflowQuery.data?.nodes ?? [],
    [workflowQuery.data?.nodes]
  )

  const pipelineQuery = useGetPipelineQuery(data?.pipelineRef)

  const sortedWorkflowNodes = useMemo(
    () => [...workflowNodes].sort((a, b) => a.order - b.order),
    [workflowNodes]
  )

  const [nodeOutputs, setNodeOutputs] = useState<
    Record<string, Record<string, unknown>>
  >({})
  const [nodeUserEdits, setNodeUserEdits] = useState<
    Record<string, Record<string, unknown>>
  >({})

  const editedOutputs = useMemo(
    () =>
      flattenWorkflowNodesToFlatOutputs(
        sortedWorkflowNodes,
        nodeOutputs,
        nodeUserEdits
      ),
    [sortedWorkflowNodes, nodeOutputs, nodeUserEdits]
  )

  const creditByNodeId = useMemo(
    () => data?.creditUsage?.byNodeId ?? {},
    [data?.creditUsage?.byNodeId],
  )
  const totalCreditsUsed = data?.creditUsage?.totalCredits ?? 0

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [approveEnabled, setApproveEnabled] = useState(false)
  const [showRejectedBanner, setShowRejectedBanner] = useState(false)

  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  const [rerunNodeId, setRerunNodeId] = useState<string | null>(null)
  const [rerunConfigDraft, setRerunConfigDraft] = useState<
    Record<string, unknown>
  >({})
  const [runByNodeId, setRunByNodeId] = useState<
    Partial<Record<string, ReturnType<typeof emptyRunState>>>
  >({})
  const [globalRerunning, setGlobalRerunning] = useState(false)

  const [saveLoading, setSaveLoading] = useState(false)
  const [approveLoading, setApproveLoading] = useState(false)
  const [uploadNavLoading, setUploadNavLoading] = useState(false)

  const [genMoreOpen, setGenMoreOpen] = useState(false)
  const [availableTypes, setAvailableTypes] = useState<WorkflowNodeType[]>([])
  const [availableTypesLoading, setAvailableTypesLoading] = useState(false)
  const [selectedGenType, setSelectedGenType] =
    useState<WorkflowNodeType | null>(null)
  const [genMoreConfigDraft, setGenMoreConfigDraft] = useState<
    Record<string, unknown>
  >({})
  const [genMoreDraftNodeId, setGenMoreDraftNodeId] = useState<string | null>(
    null,
  )
  const [isGeneratingMore, setIsGeneratingMore] = useState(false)
  const [generateMorePending, setGenerateMorePending] = useState<{
    nodeId: string
    type: WorkflowNodeType
    config: Record<string, unknown>
  } | null>(null)

  const generateMoreRetryRef = useRef<{
    type: WorkflowNodeType
    config: Record<string, unknown>
    nodeId: string
  } | null>(null)

  const normalizedGenerationChannelKeys = useMemo(() => {
    const keys = (generationChannelKeys ?? [])
      .map((k) => normalizeChannelKey(k))
      .filter(Boolean)
    return Array.from(new Set(keys))
  }, [generationChannelKeys])

  const [generationTabKey, setGenerationTabKey] =
    useState<GenerationLaneFilter>(generationDefaultKey)

  useEffect(() => {
    if (generationTabKey === "all") return
    const cur = normalizeChannelKey(String(generationTabKey))
    if (!normalizedGenerationChannelKeys.includes(cur)) {
      setGenerationTabKey("all")
    }
  }, [generationTabKey, normalizedGenerationChannelKeys])

  const generationNodes = useMemo(() => {
    const merged = buildGenerationNodesForContent(
      pipelineQuery.data?.nodes,
      sortedWorkflowNodes,
      nodeOutputs,
    )
    if (
      generateMorePending &&
      !merged.some((n) => n.nodeId === generateMorePending.nodeId)
    ) {
      const maxOrder = merged.reduce((m, n) => Math.max(m, n.order), 0)
      return [
        ...merged,
        {
          nodeId: generateMorePending.nodeId,
          type: generateMorePending.type,
          order: maxOrder + 1,
          isLocked: false,
          config: generateMorePending.config,
        },
      ]
    }
    return merged
  }, [
    generateMorePending,
    nodeOutputs,
    pipelineQuery.data?.nodes,
    sortedWorkflowNodes,
  ])

  const filteredGenerationNodes = useMemo(() => {
    const filterKey: GenerationLaneFilter =
      embedInUpload && generationTabKey !== "all"
        ? normalizeChannelKey(String(generationTabKey))
        : "all"
    return filterGenerationNodesForChannel(generationNodes, {
      filterKey,
      pipelineNodes: pipelineQuery.data?.nodes,
      nodeOutputs,
      nodeUserEdits,
      runByNodeId,
    })
  }, [
    embedInUpload,
    generationTabKey,
    generationNodes,
    nodeOutputs,
    nodeUserEdits,
    pipelineQuery.data?.nodes,
    runByNodeId,
  ])

  const generationFilterLabel = useMemo(() => {
    if (!embedInUpload || generationTabKey === "all") return null
    const key = normalizeChannelKey(String(generationTabKey))
    try {
      return getPlatformMediaConfig(key).displayName
    } catch {
      return key
    }
  }, [embedInUpload, generationTabKey])

  const generateMoreTypes = useMemo<WorkflowNodeType[]>(
    () => [
      "video_generation",
      "summarization",
      "translation",
      "image_generation",
    ],
    []
  )

  const [confirmApproveOpen, setConfirmApproveOpen] = useState(false)
  const [confirmRejectOpen, setConfirmRejectOpen] = useState(false)

  const lastNavContentIdRef = useRef<string | null>(null)

  const applyServerContent = useCallback((doc: ContentDetail) => {
    setNodeOutputs(doc.nodeOutputs ?? {})
    setNodeUserEdits(doc.nodeUserEdits ?? {})
    setHasUnsavedChanges(false)
    setApproveEnabled(false)
    setShowRejectedBanner(doc.status === "rejected")
    generateMoreRetryRef.current = null
    setGenerateMorePending(null)
    setIsGeneratingMore(false)
  }, [])

  useEffect(() => {
    if (!data || !contentId) return
    if (lastNavContentIdRef.current === contentId) return
    lastNavContentIdRef.current = contentId
    applyServerContent(data)
  }, [contentId, data, applyServerContent])

  useEffect(() => {
    if (!data || hasUnsavedChanges) return
    setNodeOutputs(data.nodeOutputs ?? {})
    setNodeUserEdits(data.nodeUserEdits ?? {})
  }, [data, hasUnsavedChanges])

  useEffect(() => {
    onWorkflowLayersChange?.({ nodeOutputs, nodeUserEdits })
  }, [nodeOutputs, nodeUserEdits, onWorkflowLayersChange])

  const markDirty = useCallback(() => {
    setHasUnsavedChanges(true)
    setApproveEnabled(false)
  }, [])

  const updateNodeUserEdit = useCallback(
    (nodeId: string, key: OutputKey, value: string | undefined) => {
      setNodeUserEdits((prev) => ({
        ...prev,
        [nodeId]: { ...prev[nodeId], [key]: value },
      }))
      markDirty()
    },
    [markDirty]
  )

  const getNodeConfigById = useCallback(
    (nodeId: string) => {
      const n = workflowNodes.find((x) => x.nodeId === nodeId)
      if (!n) return {}
      return {
        ...buildGenerateMoreDefaultConfig(n.type, ruleHint),
        ...(n.config ?? {}),
      }
    },
    [workflowNodes, ruleHint]
  )

  const setRunState = useCallback(
    (nodeId: string, partial: Partial<ReturnType<typeof emptyRunState>>) => {
      setRunByNodeId((prev) => ({
        ...prev,
        [nodeId]: { ...emptyRunState(), ...prev[nodeId], ...partial },
      }))
    },
    []
  )

  useEffect(() => {
    if (!contentId) return
    joinContentRoom(contentId)

    const filter = <T extends { contentId?: string }>(p: T) =>
      p.contentId === contentId

    const cleanups = [
      onContentNodeStarted((p) => {
        if (!filter(p)) return
        setRunState(p.nodeId, {
          phase: "running",
          stream: "",
          errorMessage: "",
        })
      }),
      onContentNodeStreaming((p) => {
        if (!filter(p)) return
        setRunByNodeId((prev) => {
          const cur = prev[p.nodeId] ?? emptyRunState()
          return {
            ...prev,
            [p.nodeId]: {
              ...cur,
              phase: "streaming",
              stream: `${cur.stream}${p.chunk}`,
            },
          }
        })
      }),
      onContentNodeProcessing((p) => {
        if (!filter(p)) return
        setRunState(p.nodeId, {
          phase: "processing",
          processingMessage: p.message ?? "Processing…",
        })
      }),
      onContentNodeRetrying((p) => {
        if (!filter(p)) return
        setRunState(p.nodeId, {
          phase: "retrying",
          retryLabel: `Retrying… attempt ${p.attempt}/${p.maxAttempts}`,
        })
      }),
      onContentNodeFailedFinal((p) => {
        if (!filter(p)) return
        setRunState(p.nodeId, {
          phase: "error",
          errorMessage: p.message ?? "Re-run failed. Please try again.",
        })
        if (generateMorePending?.nodeId === p.nodeId) {
          setGenerateMorePending(null)
          setIsGeneratingMore(false)
        }
        setGlobalRerunning(false)
        setRerunNodeId(null)
      }),
      onContentNodeRerunCompleted((p) => {
        if (!filter(p)) return
        const fromGenMore = generateMorePending?.nodeId === p.nodeId
        setNodeOutputs((prev) => ({
          ...prev,
          [p.nodeId]: { ...(prev[p.nodeId] ?? {}), ...p.output },
        }))
        setHasUnsavedChanges(true)
        setApproveEnabled(false)
        setRunState(p.nodeId, emptyRunState())
        if (fromGenMore) {
          setGenerateMorePending(null)
          setIsGeneratingMore(false)
        }
        setGlobalRerunning(false)
        setRerunNodeId(null)
        void queryClient.invalidateQueries({ queryKey: ["content", contentId] })
        toast.success(i18n.t("upload:toast.nodeUpdated"))
      }),
    ]

    return () => {
      cleanups.forEach((fn) => fn())
      leaveContentRoom(contentId)
    }
  }, [contentId, generateMorePending, queryClient, setRunState])

  const saveMutation = useMutation({
    mutationFn: () => {
      return contentService.save(contentId!, {
        userEdits: {
          keywords: editedOutputs.keywords,
          text: editedOutputs.text,
          translatedText: editedOutputs.translatedText,
          transcription: editedOutputs.transcription,
          summary: editedOutputs.summary,
          image: editedOutputs.image,
          video: editedOutputs.video,
        },
        nodeUserEdits,
      })
    },
    onSuccess: async () => {
      toast.success(i18n.t("upload:toast.changesSaved"))
      void queryClient.invalidateQueries({
        queryKey: ["contents"],
        exact: false,
      })
      if (uploadId) {
        void queryClient.invalidateQueries({ queryKey: ["upload", uploadId] })
      }
      // Refetch content before clearing dirty state so the effect below does not
      // re-apply stale cached nodeOutputs (e.g. missing generate-more results).
      try {
        await queryClient.refetchQueries({ queryKey: ["content", contentId] })
      } catch {
        void queryClient.invalidateQueries({ queryKey: ["content", contentId] })
      }
      setHasUnsavedChanges(false)
      setApproveEnabled(true)
    },
    onError: (err) => {
      toastApiError(err, "upload:toast.saveFailed")
    },
  })

  useEffect(() => {
    if (!genMoreOpen || !contentId) return
    setSelectedGenType(null)
    setGenMoreConfigDraft({})
    setGenMoreDraftNodeId(null)
    let cancelled = false
    setAvailableTypesLoading(true)
    void contentService
      .getAvailableNodeTypes(contentId)
      .then((r) => {
        if (cancelled) return
        // Users should be able to generate (or re-generate) any supported output type,
        // even if that output already exists in the current content.
        const supported = new Set<WorkflowNodeType>([
          ...generateMoreTypes,
          ...(r.types ?? []),
        ])
        setAvailableTypes(generateMoreTypes.filter((t) => supported.has(t)))
        setAvailableTypesLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        toastApiError(err, "upload:toast.loadOutputsFailed")
        setAvailableTypesLoading(false)
        setAvailableTypes(generateMoreTypes)
      })
    return () => {
      cancelled = true
    }
  }, [genMoreOpen, contentId, generateMoreTypes])

  const submitGenerateMore = useCallback(
    async (type: WorkflowNodeType, config: Record<string, unknown>) => {
      if (!contentId) return
      const key = outputKeyForNodeType(type)
      if (!key) {
        toast.error(i18n.t("upload:toast.unknownNodeType"))
        return
      }
      setIsGeneratingMore(true)
      setApproveEnabled(false)
      setGenMoreOpen(false)
      setSelectedGenType(null)
      setGenMoreConfigDraft({})
      try {
        const { nodeId } = await contentService.generateNode(contentId, {
          type,
          config,
          ...(genMoreDraftNodeId ? { nodeId: genMoreDraftNodeId } : {}),
        })
        setGenMoreDraftNodeId(null)
        setRunState(nodeId, { phase: "running", stream: "", errorMessage: "" })
        generateMoreRetryRef.current = { type, config, nodeId }
        setGenerateMorePending({ nodeId, type, config })
        if (data?.workflowRef) {
          await queryClient.refetchQueries({
            queryKey: ["workflow", data.workflowRef],
          })
        }
      } catch (err) {
        toastApiError(err, "upload:toast.startGenerationFailed")
        generateMoreRetryRef.current = { type, config, nodeId: "" }
        setIsGeneratingMore(false)
      }
    },
    [contentId, data?.workflowRef, genMoreDraftNodeId, queryClient, setRunState]
  )

  const approveMutation = useMutation({
    mutationFn: () => contentService.approve(contentId!),
    onSuccess: ({ uploadId: approvedId }) => {
      toast.success(i18n.t("upload:toast.approved"))
      void queryClient.invalidateQueries({ queryKey: ["content", contentId] })
      void queryClient.invalidateQueries({
        queryKey: ["contents"],
        exact: false,
      })
      const uid = uploadId ?? approvedId
      if (uid) {
        void queryClient.invalidateQueries({ queryKey: ["upload", uid] })
      }
      if (!embedInUpload) {
        navigate(`/upload/${approvedId}`)
      }
    },
    onError: (err) => {
      toastApiError(err, "upload:toast.approveFailed")
    },
  })

  const rejectMutation = useMutation({
    mutationFn: () => contentService.reject(contentId!),
    onSuccess: () => {
      toast.success(i18n.t("upload:toast.rejected"))
      setShowRejectedBanner(true)
      queryClient.setQueryData<ContentDetail | undefined>(
        ["content", contentId],
        (old) => (old ? { ...old, status: "rejected" } : old)
      )
    },
    onError: (err) => {
      toastApiError(err, "upload:toast.rejectFailed")
    },
  })

  async function handleSave() {
    if (!contentId) return
    setSaveLoading(true)
    try {
      await saveMutation.mutateAsync()
    } finally {
      setSaveLoading(false)
    }
  }

  async function handleApproveConfirm() {
    if (!contentId) return
    setConfirmApproveOpen(false)
    setApproveLoading(true)
    try {
      await approveMutation.mutateAsync()
    } finally {
      setApproveLoading(false)
    }
  }

  async function handleContinueToUpload() {
    if (!data) return
    setUploadNavLoading(true)
    try {
      const { uploadId } = await uploadService.findIdByContentRef(
        data.contentId
      )
      navigate(`/upload/${uploadId}`)
    } catch (err) {
      toastApiError(err, "upload:toast.openUploadFailed")
      navigate("/upload")
    } finally {
      setUploadNavLoading(false)
    }
  }

  function openRerun(nodeId: string) {
    if (globalRerunning || isGeneratingMore) return
    setRerunNodeId(nodeId)
    setRerunConfigDraft(getNodeConfigById(nodeId))
    setRunByNodeId((prev) => ({ ...prev, [nodeId]: emptyRunState() }))
  }

  async function submitRerun(nodeId: string) {
    if (isGeneratingMore) {
      toast.error(i18n.t("upload:toast.waitGeneration"))
      return
    }
    generateMoreRetryRef.current = null
    if (!contentId) {
      toast.error(i18n.t("upload:toast.resolveNodeFailed"))
      return
    }
    setGlobalRerunning(true)
    setApproveEnabled(false)
    setRunState(nodeId, { phase: "running", stream: "", errorMessage: "" })
    try {
      await contentService.rerunNode(contentId, {
        nodeId,
        updatedConfig: rerunConfigDraft,
        previousOutputs: {
          keywords: editedOutputs.keywords,
          text: editedOutputs.text,
          translatedText: editedOutputs.translatedText,
          transcription: editedOutputs.transcription,
          summary: editedOutputs.summary,
          image: editedOutputs.image,
          video: editedOutputs.video,
        },
      })
      setRerunNodeId(null)
    } catch (err) {
      toastApiError(err, "upload:toast.rerunFailed")
      setGlobalRerunning(false)
      setRunState(nodeId, {
        phase: "error",
        errorMessage: "Could not start re-run.",
      })
    }
  }

  async function uploadMediaForNode(
    nodeId: string,
    key: "image" | "video",
    file: File
  ) {
    const label = key === "image" ? "image" : "video"
    setRunState(nodeId, {
      phase: "running",
      processingMessage: `Uploading ${label}…`,
    })
    try {
      const { url } = await uploadMediaService.uploadFile(file)
      const outKey: OutputKey = key === "image" ? "image" : "video"
      updateNodeUserEdit(nodeId, outKey, url)
      setRunState(nodeId, emptyRunState())
    } catch (err) {
      setRunState(nodeId, {
        phase: "error",
        errorMessage: "Upload failed. Try again.",
      })
      toastApiError(err, "upload:toast.mediaUploadFailed")
    }
  }

  async function uploadMedia(key: "image" | "video", file: File) {
    const outKey: OutputKey = key === "image" ? "image" : "video"
    const nid = lastNodeIdForOutputKey(workflowNodes, outKey)
    if (!nid) {
      toast.error(i18n.t("upload:toast.noMediaSlot"))
      return
    }
    await uploadMediaForNode(nid, key, file)
  }

  const blockPipeline = globalRerunning || isGeneratingMore

  const approveDisabled =
    !approveEnabled || hasUnsavedChanges || approveLoading || blockPipeline

  const workflowTitle = workflowQuery.data?.workflow?.name ?? "Content review"

  useSetBreadcrumbLabel(workflowTitle)

  const workflowDisplayName = workflowQuery.data?.workflow?.name

  const copyOutput = useCallback(async (text: string) => {
    const t = text.trim()
    if (!t) {
      toast.error(i18n.t("upload:toast.nothingToCopy"))
      return
    }
    try {
      await navigator.clipboard.writeText(t)
      toast.success(i18n.t("upload:toast.copied"))
    } catch {
      toast.error(i18n.t("upload:toast.copyFailed"))
    }
  }, [])

  const closeGenMore = useCallback(() => {
    setGenMoreOpen(false)
    setSelectedGenType(null)
    setGenMoreConfigDraft({})
    setGenMoreDraftNodeId(null)
  }, [])

  if (!contentId) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        This page needs a valid content link.
      </div>
    )
  }

  if (contentQuery.isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 p-6 pb-28">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-48 rounded-xl" />
        ))}
      </div>
    )
  }

  if (contentQuery.isError || !data) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-6">
        <p className="text-sm text-muted-foreground">
          Could not load content. Please try again.
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => contentQuery.refetch()}
        >
          Retry
        </Button>
      </div>
    )
  }

  const genMoreButton = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-9 text-xs shadow-sm"
      disabled={blockPipeline || saveLoading}
      onClick={() => setGenMoreOpen(true)}
    >
      <Sparkles className="mr-1.5 size-3.5 text-primary" />
      Generate more
    </Button>
  )

  const genMoreDialog = (
    <Dialog
      open={genMoreOpen}
      onOpenChange={(open) => {
        if (open) {
          setGenMoreOpen(true)
          return
        }
        closeGenMore()
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">
            {selectedGenType
              ? pipelineStepLabel(selectedGenType)
              : "Add another output"}
          </DialogTitle>
        </DialogHeader>
        {availableTypesLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : !selectedGenType ? (
          availableTypes.length === 0 ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              No output types are available.
            </p>
          ) : (
            <div className="flex max-h-[min(60vh,360px)] flex-col gap-2 overflow-y-auto pr-1">
              {availableTypes.map((t) => (
                <button
                  key={t}
                  type="button"
                  className="flex w-full items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:border-primary/50 hover:bg-muted/50"
                  onClick={() => {
                    setSelectedGenType(t)
                    setGenMoreDraftNodeId(randomUuid())
                    setGenMoreConfigDraft(
                      buildGenerateMoreDefaultConfig(t, ruleHint)
                    )
                  }}
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <PipelineTypeIcon type={t} />
                  </span>
                  <span className="font-medium">{pipelineStepLabel(t)}</span>
                </button>
              ))}
            </div>
          )
        ) : (
          <div className="flex flex-col gap-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-2 h-8 justify-start text-xs text-muted-foreground"
              onClick={() => {
                setSelectedGenType(null)
                setGenMoreDraftNodeId(null)
              }}
            >
              ← Change type
            </Button>
            <WorkflowNodeGuideSection
              canvasType={backendTypeToCanvas(selectedGenType)}
            />
            <div className="max-h-[min(55vh,420px)] overflow-y-auto pr-1">
              <WorkflowNodeConfigFields
                canvasType={backendTypeToCanvas(selectedGenType)}
                config={genMoreConfigDraft}
                onChange={setGenMoreConfigDraft}
                workflowId={data?.workflowRef}
                nodeId={genMoreDraftNodeId ?? undefined}
                persistPresenterToServer={false}
                compact
              />
            </div>
            <Button
              type="button"
              size="sm"
              className="h-9 w-full"
              disabled={blockPipeline}
              onClick={() =>
                void submitGenerateMore(selectedGenType, genMoreConfigDraft)
              }
            >
              Start generation
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )

  return (
    <TooltipProvider>
      <div className="relative flex min-h-0 flex-1 flex-col">
        {showRejectedBanner ? (
          <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-sm text-amber-900 dark:text-amber-200">
            This content has been rejected. You can continue editing.
          </div>
        ) : null}

        {embedInUpload && preview !== undefined ? (
          <div className="grid max-h-[100vh] min-h-0 min-w-0 flex-1 gap-4 overflow-y-auto px-4 py-4 md:px-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:gap-5">
            <div className="h-full min-w-0 overflow-y-auto">{preview}</div>

            <div className="flex max-h-[80vh] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <div className="border-b border-border px-4 py-2.5">
                <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                  Generation
                </p>
                {generationFilterLabel ? (
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    Showing outputs for {generationFilterLabel}
                  </p>
                ) : null}
              </div>
              <div className="h-full min-h-0 flex-1 overflow-y-auto">
                <div className="w-full border-b border-border px-4 py-3 [&_button]:w-full">
                  {genMoreButton}
                </div>
                <div className="px-4 py-3">
                  <div className="mb-3 space-y-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <p className="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase">
                          Generated contents
                        </p>
                        {totalCreditsUsed > 0 ? (
                          <CreditUsageBadge
                            credits={totalCreditsUsed}
                            showLabel
                          />
                        ) : null}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="relative h-9 shrink-0 sm:min-w-[140px]"
                        disabled={saveLoading || blockPipeline}
                        onClick={() => void handleSave()}
                      >
                        {saveLoading ? "Saving…" : "Save changes"}
                        {hasUnsavedChanges ? (
                          <span
                            className="absolute top-1 right-2 size-2 rounded-full bg-amber-500"
                            aria-hidden
                          />
                        ) : null}
                      </Button>
                    </div>
                    {embedInUpload && normalizedGenerationChannelKeys.length > 0 ? (
                      <Tabs
                        value={String(generationTabKey)}
                        onValueChange={(v) => {
                          if (v === "all") {
                            setGenerationTabKey("all")
                            return
                          }
                          setGenerationTabKey(normalizeChannelKey(v))
                        }}
                        className="min-w-0"
                      >
                        <TabsList
                          variant="default"
                          className="h-auto max-w-full min-w-0 justify-start gap-0.5 overflow-x-auto rounded-lg border border-border bg-muted/50 p-0.5"
                        >
                          <TabsTrigger
                            value="all"
                            className="h-7 shrink-0 flex-none rounded-md px-2.5 text-xs select-none after:hidden"
                          >
                            All
                          </TabsTrigger>
                          {normalizedGenerationChannelKeys.map((key) => {
                            let label = key
                            try {
                              label = getPlatformMediaConfig(key).displayName
                            } catch {
                              // ignore
                            }
                            return (
                              <TabsTrigger
                                key={key}
                                value={key}
                                className="h-7 shrink-0 flex-none rounded-md px-2.5 text-xs select-none after:hidden"
                              >
                                {label}
                              </TabsTrigger>
                            )
                          })}
                        </TabsList>
                      </Tabs>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-2">
                    {filteredGenerationNodes.map((wfNode, cardIndex) => {
                      const nodeId = wfNode.nodeId
                      const run = runByNodeId[nodeId] ?? emptyRunState()
                      const key = outputKeyForNodeType(wfNode.type)
                      const layer = mergeNodeOutputLayers(
                        nodeOutputs,
                        nodeUserEdits,
                        nodeId
                      )
                      const baseText = key
                        ? staticTextFromLayer(layer, key)
                        : wfNode.type === "adapt"
                          ? staticTextFromLayer(layer, "text")
                          : ""
                      const displayText =
                        run.phase === "streaming" || run.phase === "running"
                          ? run.stream ||
                            (run.phase === "running" ? "" : baseText)
                          : baseText

                      return (
                        <UploadGenerationDraggableCard
                          key={nodeId}
                          wfNode={wfNode}
                          cardIndex={cardIndex}
                          nodeOutputs={nodeOutputs}
                          nodeUserEdits={nodeUserEdits}
                          flatEditedOutputs={editedOutputs}
                          run={run}
                          displayText={displayText}
                          globalRerunning={globalRerunning}
                          blockPipeline={blockPipeline}
                          onOpenRerun={openRerun}
                          onSubmitRerun={submitRerun}
                          onRetry={() => {
                            const r = generateMoreRetryRef.current
                            if (
                              r?.nodeId &&
                              generateMorePending?.nodeId === r.nodeId
                            ) {
                              void submitGenerateMore(r.type, r.config)
                              return
                            }
                            void submitRerun(nodeId)
                          }}
                          updateNodeUserEdit={updateNodeUserEdit}
                          setRunState={setRunState}
                          setLightboxUrl={setLightboxUrl}
                          uploadMediaForNode={uploadMediaForNode}
                          onCopyOutput={(t) => void copyOutput(t)}
                          creditsUsed={creditByNodeId[nodeId] ?? 0}
                        />
                      )
                    })}
                  </div>
                  {filteredGenerationNodes.length === 0 ? (
                    <p className="mt-4 text-center text-xs text-muted-foreground">
                      {generationNodes.length > 0 && generationFilterLabel
                        ? `Nothing generated for ${generationFilterLabel} yet.`
                        : "No outputs to display yet."}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col lg:flex-row">
            <motion.div
              className="min-h-0 min-w-0 flex-1 overflow-y-auto px-5 py-6 md:px-7 md:pb-12"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.35 }}
            >
              <ContentDetailReviewHeader
                workflowTitle={workflowTitle}
                data={data}
              />

              {data.newsMeta ? (
                <ContentNewsSourceBanner newsMeta={data.newsMeta} />
              ) : null}

              <div className="mb-4">{genMoreButton}</div>

              <div className="flex flex-col gap-4">
                {generationNodes.map((wfNode, cardIndex) => {
                  const nodeId = wfNode.nodeId
                  const run = runByNodeId[nodeId] ?? emptyRunState()
                  const key = outputKeyForNodeType(wfNode.type)
                  if (!key) return null
                  const isTextLike =
                    key === "text" ||
                    key === "translatedText" ||
                    key === "transcription" ||
                    key === "summary"
                  const layer = mergeNodeOutputLayers(
                    nodeOutputs,
                    nodeUserEdits,
                    nodeId
                  )
                  const highlight =
                    run.phase === "running" ||
                    run.phase === "streaming" ||
                    run.phase === "processing" ||
                    run.phase === "retrying"
                      ? "ring-2 ring-[#00C9A7]/35"
                      : run.phase === "error"
                        ? "ring-2 ring-red-400/70"
                        : ""

                  const baseText = staticTextFromLayer(layer, key)
                  const displayText =
                    run.phase === "streaming" || run.phase === "running"
                      ? run.stream || (run.phase === "running" ? "" : baseText)
                      : baseText

                  const hasBodyOutput =
                    key === "image"
                      ? typeof layer.image === "string" &&
                        layer.image.trim() !== ""
                      : key === "video"
                        ? typeof layer.video === "string" &&
                          layer.video.trim() !== ""
                        : isNonEmptyOutput(displayText)

                  const editedForCard: Partial<
                    Record<OutputKey, string | undefined>
                  > = {
                    ...editedOutputs,
                  }
                  if (typeof layer.keywords === "string")
                    editedForCard.keywords = layer.keywords
                  if (typeof layer.text === "string")
                    editedForCard.text = layer.text
                  if (typeof layer.image === "string")
                    editedForCard.image = layer.image
                  if (typeof layer.translatedText === "string")
                    editedForCard.translatedText = layer.translatedText
                  if (typeof layer.video === "string")
                    editedForCard.video = layer.video
                  if (typeof layer.transcription === "string")
                    editedForCard.transcription = layer.transcription
                  if (typeof layer.summary === "string")
                    editedForCard.summary = layer.summary

                  return (
                    <ContentDetailNodeCard
                      key={nodeId}
                      nodeKey={key}
                      cardIndex={cardIndex}
                      run={run}
                      editedOutputs={editedForCard}
                      globalRerunning={blockPipeline}
                      displayText={displayText}
                      hasBodyOutput={hasBodyOutput}
                      isTextLike={isTextLike}
                      highlight={highlight}
                      wfNode={wfNode}
                      nodeId={nodeId}
                      onCopyOutput={(t) => void copyOutput(t)}
                      onOpenRerun={(_key: OutputKey) => {
                        void _key
                        openRerun(nodeId)
                      }}
                      onSubmitRerun={(_key: OutputKey) => {
                        void _key
                        void submitRerun(nodeId)
                      }}
                      onRetry={() => {
                        const r = generateMoreRetryRef.current
                        if (
                          r?.nodeId &&
                          generateMorePending?.nodeId === r.nodeId
                        ) {
                          void submitGenerateMore(r.type, r.config)
                          return
                        }
                        void submitRerun(nodeId)
                      }}
                      updateOutput={(k, v) => updateNodeUserEdit(nodeId, k, v)}
                      setRunState={(_k, partial) =>
                        setRunState(nodeId, partial)
                      }
                      setLightboxUrl={setLightboxUrl}
                      uploadMedia={uploadMedia}
                    />
                  )
                })}
              </div>

              {generationNodes.length === 0 ? (
                <p className="mt-6 text-center text-sm text-muted-foreground">
                  No outputs to display yet.
                </p>
              ) : null}
            </motion.div>

            <ContentDetailReviewSidebar
              data={data}
              workflowName={workflowDisplayName}
              sortedWorkflowNodes={sortedWorkflowNodes}
              editedOutputs={editedOutputs}
              runByKey={{}}
              approveDisabled={approveDisabled}
              approveLoading={approveLoading}
              uploadNavLoading={uploadNavLoading}
              saveLoading={saveLoading}
              globalRerunning={blockPipeline}
              hasUnsavedChanges={hasUnsavedChanges}
              onApproveClick={() => setConfirmApproveOpen(true)}
              onRejectClick={() => setConfirmRejectOpen(true)}
              onContinueToUpload={handleContinueToUpload}
              onSave={handleSave}
              hideContinueToUpload={embedInUpload}
            />
          </div>
        )}

        <ContentDetailRerunSheet
          openNodeId={rerunNodeId}
          workflowNodes={workflowNodes}
          workflowId={data?.workflowRef}
          globalRerunning={blockPipeline}
          configDraft={rerunConfigDraft}
          onConfigChange={setRerunConfigDraft}
          onOpenChange={(open) => {
            if (!open) setRerunNodeId(null)
          }}
          onSubmit={(nid) => void submitRerun(nid)}
        />

        <ContentDetailImageLightbox
          url={lightboxUrl}
          onClose={() => setLightboxUrl(null)}
        />

        <ContentDetailConfirmDialogs
          approveOpen={confirmApproveOpen}
          rejectOpen={confirmRejectOpen}
          setApproveOpen={setConfirmApproveOpen}
          setRejectOpen={setConfirmRejectOpen}
          onApproveConfirm={handleApproveConfirm}
          onRejectConfirm={() => rejectMutation.mutateAsync()}
        />

        {genMoreDialog}
      </div>
    </TooltipProvider>
  )
}
