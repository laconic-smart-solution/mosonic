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
import { motion } from "framer-motion"
import { Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { TooltipProvider } from "@/components/ui/tooltip"
import { WorkflowNodeConfigFields } from "@/features/workflow/components/workflow-node-config-fields"
import {
  backendTypeToCanvas,
  buildGenerateMoreDefaultConfig,
  type GenerateMoreRuleHint,
} from "@/features/workflow/data/workflow-model"

import {
  type OutputKey,
  flattenWorkflowNodesToFlatOutputs,
  lastNodeIdForOutputKey,
  mergeNodeOutputLayers,
  outputKeyForNodeType,
} from "@/features/content/data/content-review-helpers"
import { buildGenerationNodesForContent } from "@/features/upload/lib/upload-generation-nodes"
import { ContentDetailNodeCard } from "@/features/content/components/content-detail/content-detail-node-card"
import {
  ContentDetailConfirmDialogs,
  ContentDetailImageLightbox,
  ContentDetailRerunSheet,
} from "@/features/content/components/content-detail/content-detail-overlays"
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

function staticTextFromLayer(
  layer: Record<string, unknown>,
  key: OutputKey
): string {
  switch (key) {
    case "keywords":
      return typeof layer.keywords === "string" ? layer.keywords : ""
    case "text":
      return typeof layer.text === "string" ? layer.text : ""
    case "translatedText":
      return typeof layer.translatedText === "string"
        ? layer.translatedText
        : ""
    case "transcription":
      return typeof layer.transcription === "string" ? layer.transcription : ""
    case "summary":
      return typeof layer.summary === "string" ? layer.summary : ""
    default:
      return ""
  }
}

export type UploadContentReviewPanelProps = {
  contentId: string | undefined
  /** Current upload route id — used to invalidate publish workspace after save/approve */
  uploadId?: string
  /** When true, approving stays on this page and hides redundant “Continue to upload” */
  embedInUpload?: boolean
  /** Middle column when embedded in the Upload workspace (caption, media, publish) */
  preview?: ReactNode
  /** Left column when embedded: scheduled/post status + platform card preview */
  channelPreview?: ReactNode
  /** Fired whenever per-node outputs / edits change (used to resolve pinned drag-drop captions). */
  onWorkflowLayersChange?: (layers: WorkflowNodeLayersSnapshot) => void
}

export function UploadContentReviewPanel({
  contentId,
  uploadId,
  embedInUpload = false,
  preview,
  channelPreview,
  onWorkflowLayersChange,
}: UploadContentReviewPanelProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const contentQuery = useGetContentQuery(contentId)
  const data = contentQuery.data

  const ruleQuery = useRuleByIdQuery<GenerateMoreRuleHint>(data?.ruleRef)
  const ruleHint = ruleQuery.data

  const workflowQuery = useGetWorkflowQuery(data?.workflowRef, {
    refetchInterval: false,
  })
  const workflowNodes = useMemo(
    () => workflowQuery.data?.nodes ?? [],
    [workflowQuery.data?.nodes]
  )

  const pipelineQuery = useGetPipelineQuery(data?.pipelineRef, {
    refetchInterval: false,
  })

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

  const generateMoreTypes = useMemo<WorkflowNodeType[]>(
    () => [
      "video_generation",
      "transcription",
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
        toast.success("Node output updated — save when ready.")
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
      toast.success("Changes saved")
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
    onError: () => {
      toast.error("Failed to save. Please try again.")
    },
  })

  useEffect(() => {
    if (!genMoreOpen || !contentId) return
    setSelectedGenType(null)
    setGenMoreConfigDraft({})
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
      .catch(() => {
        if (cancelled) return
        toast.error("Could not load available outputs.")
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
        toast.error("Unknown node type.")
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
        })
        setRunState(nodeId, { phase: "running", stream: "", errorMessage: "" })
        generateMoreRetryRef.current = { type, config, nodeId }
        setGenerateMorePending({ nodeId, type, config })
        if (data?.workflowRef) {
          await queryClient.refetchQueries({
            queryKey: ["workflow", data.workflowRef],
          })
        }
      } catch {
        toast.error("Could not start generation.")
        generateMoreRetryRef.current = { type, config, nodeId: "" }
        setIsGeneratingMore(false)
      }
    },
    [contentId, data?.workflowRef, queryClient, setRunState]
  )

  const approveMutation = useMutation({
    mutationFn: () => contentService.approve(contentId!),
    onSuccess: ({ uploadId: approvedId }) => {
      toast.success("Content approved.")
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
    onError: () => {
      toast.error("Could not approve. Please try again.")
    },
  })

  const rejectMutation = useMutation({
    mutationFn: () => contentService.reject(contentId!),
    onSuccess: () => {
      toast.success("Content rejected.")
      setShowRejectedBanner(true)
      queryClient.setQueryData<ContentDetail | undefined>(
        ["content", contentId],
        (old) => (old ? { ...old, status: "rejected" } : old)
      )
    },
    onError: () => {
      toast.error("Could not reject. Please try again.")
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
    } catch {
      toast.error(
        "Could not open upload. Try the Upload page from the main menu."
      )
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
      toast.error("Wait for the current generation to finish.")
      return
    }
    generateMoreRetryRef.current = null
    if (!contentId) {
      toast.error("Could not resolve node for this output.")
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
    } catch {
      toast.error("Could not start re-run.")
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
    } catch {
      setRunState(nodeId, {
        phase: "error",
        errorMessage: "Upload failed. Try again.",
      })
      toast.error("Media upload failed.")
    }
  }

  async function uploadMedia(key: "image" | "video", file: File) {
    const outKey: OutputKey = key === "image" ? "image" : "video"
    const nid = lastNodeIdForOutputKey(workflowNodes, outKey)
    if (!nid) {
      toast.error("No media slot for upload.")
      return
    }
    await uploadMediaForNode(nid, key, file)
  }

  const blockPipeline = globalRerunning || isGeneratingMore

  const approveDisabled =
    !approveEnabled || hasUnsavedChanges || approveLoading || blockPipeline

  const workflowTitle = workflowQuery.data?.workflow?.name ?? "Content review"

  const workflowDisplayName = workflowQuery.data?.workflow?.name

  const copyOutput = useCallback(async (text: string) => {
    const t = text.trim()
    if (!t) {
      toast.error("Nothing to copy")
      return
    }
    try {
      await navigator.clipboard.writeText(t)
      toast.success("Copied to clipboard")
    } catch {
      toast.error("Copy failed")
    }
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

  const genMorePopover = (
    <Popover
      open={genMoreOpen}
      onOpenChange={(open) => {
        setGenMoreOpen(open)
        if (!open) {
          setSelectedGenType(null)
          setGenMoreConfigDraft({})
        }
      }}
    >
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 border-[#EDE9E1] bg-card text-xs text-[#0F1F3D] shadow-sm"
            disabled={blockPipeline || saveLoading}
          >
            <Sparkles className="mr-1.5 size-3.5 text-[#00A589]" />
            Generate more
          </Button>
        }
      />
      <PopoverContent
        className="w-[min(100vw-2rem,300px)] p-4"
        side="bottom"
        align="start"
      >
        <PopoverHeader className="space-y-0 pb-3">
          <PopoverTitle className="text-sm font-semibold text-[#0F1F3D]">
            {selectedGenType
              ? pipelineStepLabel(selectedGenType)
              : "Add another output"}
          </PopoverTitle>
        </PopoverHeader>
        {availableTypesLoading ? (
          <p className="text-xs text-[#A89D8E]">Loading…</p>
        ) : !selectedGenType ? (
          availableTypes.length === 0 ? (
            <p className="text-xs leading-relaxed text-[#857A6C]">
              No output types are available.
            </p>
          ) : (
            <div className="flex max-h-[280px] flex-col gap-2 overflow-y-auto pr-1">
              {availableTypes.map((t) => (
                <button
                  key={t}
                  type="button"
                  className="flex w-full items-center gap-2.5 rounded-xl border border-[#EDE9E1] bg-[color:var(--nt-canvas)] px-3 py-2.5 text-left text-sm text-[#0F1F3D] transition-colors hover:border-[#00C9A7]/50 hover:bg-[#E0FAF5]/30"
                  onClick={() => {
                    setSelectedGenType(t)
                    setGenMoreConfigDraft(
                      buildGenerateMoreDefaultConfig(t, ruleHint)
                    )
                  }}
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#E0FAF5]">
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
              className="-ml-2 h-8 justify-start text-xs text-[#857A6C]"
              onClick={() => setSelectedGenType(null)}
            >
              ← Change type
            </Button>
            <p className="text-[11px] leading-relaxed text-[#857A6C]">
              Tune how this step runs. The campaign brief from the original run
              is reused automatically.
            </p>
            <div className="max-h-[min(50vh,320px)] overflow-y-auto pr-1">
              <WorkflowNodeConfigFields
                canvasType={backendTypeToCanvas(selectedGenType)}
                config={genMoreConfigDraft}
                onChange={setGenMoreConfigDraft}
                compact
              />
            </div>
            <Button
              type="button"
              size="sm"
              className="h-9 w-full bg-[#254C94] text-white hover:bg-[#1A3260]"
              disabled={blockPipeline}
              onClick={() =>
                void submitGenerateMore(selectedGenType, genMoreConfigDraft)
              }
            >
              Start generation
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )

  return (
    <TooltipProvider>
      <div className="relative flex min-h-0 flex-1 flex-col">
        {showRejectedBanner ? (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">
            This content has been rejected. You can continue editing.
          </div>
        ) : null}

        {embedInUpload && preview !== undefined ? (
          <div className="grid max-h-[100vh] min-h-0 min-w-0 flex-1 gap-4 overflow-y-auto px-4 py-4 md:px-5 lg:grid-cols-3 lg:gap-5">
            <div className="flex min-h-0 flex-col gap-3 overflow-y-auto rounded-xl border border-[#EDE9E1] bg-card p-4 shadow-sm">
              <div className="max-h-[70vh] min-w-0 flex-1 space-y-3">
                {channelPreview ?? (
                  <p className="text-xs text-muted-foreground">
                    Select a channel to see how the post will look.
                  </p>
                )}
              </div>
            </div>

            <div className="h-full min-w-0 overflow-y-auto">{preview}</div>

            <div className="flex max-h-[80vh] flex-col overflow-hidden rounded-xl border border-[#EDE9E1] bg-card shadow-sm">
              <div className="border-b border-[#EDE9E1] px-4 py-2.5">
                <p className="text-[11px] font-semibold tracking-wide text-[#A89D8E] uppercase">
                  Generation
                </p>
              </div>
              <div className="h-full min-h-0 flex-1 overflow-y-auto">
                <div className="w-full border-b border-[#EDE9E1] px-4 py-3 [&_button]:w-full">
                  {genMorePopover}
                </div>
                <div className="px-4 py-3">
                  <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                    <p className="text-[10px] font-semibold tracking-widest text-[#A89D8E] uppercase">
                      Generated contents
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      className="relative h-9 shrink-0 border-[#EDE9E1] text-[#62594E] hover:bg-[#F7F4EF] sm:min-w-[140px]"
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
                  <div className="flex flex-col gap-2">
                    {generationNodes.map((wfNode, cardIndex) => {
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
                        />
                      )
                    })}
                  </div>
                  {generationNodes.length === 0 ? (
                    <p className="mt-4 text-center text-xs text-muted-foreground">
                      No outputs to display yet.
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
                breadcrumbParentHref={embedInUpload ? "/upload" : "/content"}
                breadcrumbParentLabel={embedInUpload ? "Upload" : "Content"}
              />

              <div className="mb-4">{genMorePopover}</div>

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
      </div>
    </TooltipProvider>
  )
}
