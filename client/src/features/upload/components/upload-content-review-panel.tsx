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
import { Textarea } from "@/components/ui/textarea"
import { TooltipProvider } from "@/components/ui/tooltip"

import {
  OUTPUT_GRID,
  type OutputKey,
  mergeExecutorOutput,
  outputKeyForNodeType,
  outputsFromDetail,
  resolveNodeId,
} from "@/features/content/data/content-review-helpers"
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
  outputKeyForNodeId,
  PipelineTypeIcon,
  pipelineStepLabel,
} from "@/features/content/components/content-detail/content-detail-review-ui"
import { useGetContentQuery } from "@/shared/queries/content.query"
import { useGetWorkflowQuery } from "@/shared/queries/workflow.query"
import { contentService } from "@/shared/services/content.service"
import { uploadService } from "@/shared/services/upload.service"
import { uploadMediaService } from "@/shared/services/upload-media.service"
import type { ContentDetail, ContentOutputs } from "@/shared/types/content.type"
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
}

export function UploadContentReviewPanel({
  contentId,
  uploadId,
  embedInUpload = false,
  preview,
  channelPreview,
}: UploadContentReviewPanelProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const contentQuery = useGetContentQuery(contentId)
  const data = contentQuery.data

  const workflowQuery = useGetWorkflowQuery(data?.workflowRef, {
    refetchInterval: false,
  })
  const workflowNodes = useMemo(
    () => workflowQuery.data?.nodes ?? [],
    [workflowQuery.data?.nodes]
  )

  const sortedWorkflowNodes = useMemo(
    () => [...workflowNodes].sort((a, b) => a.order - b.order),
    [workflowNodes]
  )

  const [editedOutputs, setEditedOutputs] = useState<
    Partial<Record<OutputKey, string | undefined>>
  >({})
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [approveEnabled, setApproveEnabled] = useState(false)
  const [showRejectedBanner, setShowRejectedBanner] = useState(false)
  const [retainedSlots, setRetainedSlots] = useState<Set<OutputKey>>(new Set())

  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  const [rerunPanelKey, setRerunPanelKey] = useState<OutputKey | null>(null)
  const [rerunPromptDraft, setRerunPromptDraft] = useState("")
  const [runByKey, setRunByKey] = useState<
    Partial<Record<OutputKey, ReturnType<typeof emptyRunState>>>
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
  const [genMorePromptDraft, setGenMorePromptDraft] = useState("")
  const [isGeneratingMore, setIsGeneratingMore] = useState(false)
  const [generateMorePending, setGenerateMorePending] = useState<{
    nodeId: string
    type: WorkflowNodeType
    userPrompt: string
  } | null>(null)

  const generateMoreByNodeIdRef = useRef<Map<string, OutputKey>>(new Map())
  const generateMoreRetryRef = useRef<{
    type: WorkflowNodeType
    userPrompt: string
    outputKey: OutputKey
  } | null>(null)
  const generatedOutputKeysRef = useRef<Set<OutputKey>>(new Set())

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
    const o = outputsFromDetail(doc.outputs)
    const slots = new Set<OutputKey>()
    for (const k of OUTPUT_GRID.flat()) {
      if (isNonEmptyOutput(o[k])) slots.add(k)
    }
    setRetainedSlots(slots)
    setEditedOutputs(o)
    setHasUnsavedChanges(false)
    setApproveEnabled(false)
    setShowRejectedBanner(doc.status === "rejected")
    generateMoreByNodeIdRef.current.clear()
    generateMoreRetryRef.current = null
    generatedOutputKeysRef.current.clear()
    setGenerateMorePending(null)
    setIsGeneratingMore(false)
  }, [])

  useEffect(() => {
    if (!data || !contentId) return
    if (lastNavContentIdRef.current === contentId) return
    lastNavContentIdRef.current = contentId
    applyServerContent(data)
  }, [contentId, data, applyServerContent])

  const visibleKeys = useMemo(() => {
    const keys = new Set<OutputKey>(retainedSlots)
    for (const k of OUTPUT_GRID.flat()) {
      if (isNonEmptyOutput(editedOutputs[k])) keys.add(k)
    }
    if (generateMorePending) {
      const k = outputKeyForNodeType(generateMorePending.type)
      if (k) keys.add(k)
    }
    return keys
  }, [editedOutputs, retainedSlots, generateMorePending])

  const orderedVisibleKeys = useMemo(() => {
    const list = [...visibleKeys]
    const ord = (k: OutputKey) => {
      const id = resolveNodeId(workflowNodes, k)
      const n = workflowNodes.find((x) => x.nodeId === id)
      if (n) return n.order
      if (
        generateMorePending &&
        outputKeyForNodeType(generateMorePending.type) === k
      ) {
        return 998
      }
      return 999
    }
    return list.sort((a, b) => ord(a) - ord(b))
  }, [visibleKeys, workflowNodes, generateMorePending])

  const markDirty = useCallback(() => {
    setHasUnsavedChanges(true)
    setApproveEnabled(false)
  }, [])

  const updateOutput = useCallback(
    (key: OutputKey, value: string | undefined) => {
      setEditedOutputs((prev) => ({ ...prev, [key]: value }))
      markDirty()
    },
    [markDirty]
  )

  const getNodePrompt = useCallback(
    (key: OutputKey) => {
      const id = resolveNodeId(workflowNodes, key)
      if (!id) return ""
      const n = workflowNodes.find((x) => x.nodeId === id)
      return n?.userPrompt?.trim() ?? ""
    },
    [workflowNodes]
  )

  const setRunState = useCallback(
    (key: OutputKey, partial: Partial<ReturnType<typeof emptyRunState>>) => {
      setRunByKey((prev) => ({
        ...prev,
        [key]: { ...emptyRunState(), ...prev[key], ...partial },
      }))
    },
    []
  )

  useEffect(() => {
    if (!contentId) return
    joinContentRoom(contentId)

    const filter = <T extends { contentId?: string }>(p: T) =>
      p.contentId === contentId

    const keyForNode = (nodeId: string) =>
      outputKeyForNodeId(workflowNodes, nodeId) ??
      generateMoreByNodeIdRef.current.get(nodeId)

    const cleanups = [
      onContentNodeStarted((p) => {
        if (!filter(p)) return
        const key = keyForNode(p.nodeId)
        if (!key) return
        setRunState(key, { phase: "running", stream: "", errorMessage: "" })
      }),
      onContentNodeStreaming((p) => {
        if (!filter(p)) return
        const key = keyForNode(p.nodeId)
        if (!key) return
        setRunByKey((prev) => {
          const cur = prev[key] ?? emptyRunState()
          return {
            ...prev,
            [key]: {
              ...cur,
              phase: "streaming",
              stream: `${cur.stream}${p.chunk}`,
            },
          }
        })
      }),
      onContentNodeProcessing((p) => {
        if (!filter(p)) return
        const key = keyForNode(p.nodeId)
        if (!key) return
        setRunState(key, {
          phase: "processing",
          processingMessage: p.message ?? "Processing…",
        })
      }),
      onContentNodeRetrying((p) => {
        if (!filter(p)) return
        const key = keyForNode(p.nodeId)
        if (!key) return
        setRunState(key, {
          phase: "retrying",
          retryLabel: `Retrying… attempt ${p.attempt}/${p.maxAttempts}`,
        })
      }),
      onContentNodeFailedFinal((p) => {
        if (!filter(p)) return
        const key = keyForNode(p.nodeId)
        if (!key) return
        setRunState(key, {
          phase: "error",
          errorMessage: p.message ?? "Re-run failed. Please try again.",
        })
        if (generateMoreByNodeIdRef.current.has(p.nodeId)) {
          generateMoreByNodeIdRef.current.delete(p.nodeId)
          setGenerateMorePending(null)
          setIsGeneratingMore(false)
        }
        setGlobalRerunning(false)
        setRerunPanelKey(null)
      }),
      onContentNodeRerunCompleted((p) => {
        if (!filter(p)) return
        const key = keyForNode(p.nodeId)
        if (!key) return
        const fromGenMore = generateMoreByNodeIdRef.current.has(p.nodeId)
        setEditedOutputs((prev) =>
          mergeExecutorOutput(p.nodeType, p.output, prev)
        )
        setRetainedSlots((rs) => new Set(rs).add(key))
        setHasUnsavedChanges(true)
        setApproveEnabled(false)
        setRunState(key, emptyRunState())
        if (fromGenMore) {
          generatedOutputKeysRef.current.add(key)
          generateMoreByNodeIdRef.current.delete(p.nodeId)
          setGenerateMorePending(null)
          setIsGeneratingMore(false)
        }
        setGlobalRerunning(false)
        setRerunPanelKey(null)
        toast.success("Node output updated — save when ready.")
      }),
    ]

    return () => {
      cleanups.forEach((fn) => fn())
      leaveContentRoom(contentId)
    }
  }, [contentId, workflowNodes, setRunState])

  const saveMutation = useMutation({
    mutationFn: () => {
      const newOutputs: Partial<ContentOutputs> = {}
      for (const k of generatedOutputKeysRef.current) {
        const v = editedOutputs[k]
        if (typeof v === "string" && v.trim() !== "") {
          newOutputs[k] = v
        }
      }
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
        newOutputs: Object.keys(newOutputs).length > 0 ? newOutputs : undefined,
      })
    },
    onSuccess: async () => {
      toast.success("Changes saved")
      generatedOutputKeysRef.current.clear()
      setHasUnsavedChanges(false)
      setApproveEnabled(true)
      void queryClient.invalidateQueries({
        queryKey: ["contents"],
        exact: false,
      })
      if (uploadId) {
        void queryClient.invalidateQueries({ queryKey: ["upload", uploadId] })
      }
    },
    onError: () => {
      toast.error("Failed to save. Please try again.")
    },
  })

  useEffect(() => {
    if (!genMoreOpen || !contentId) return
    setSelectedGenType(null)
    setGenMorePromptDraft("")
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
    async (type: WorkflowNodeType, userPrompt: string) => {
      if (!contentId) return
      const key = outputKeyForNodeType(type)
      if (!key) {
        toast.error("Unknown node type.")
        return
      }
      setIsGeneratingMore(true)
      setApproveEnabled(false)
      setRunState(key, { phase: "running", stream: "", errorMessage: "" })
      setGenMoreOpen(false)
      setSelectedGenType(null)
      setGenMorePromptDraft("")
      try {
        const { nodeId } = await contentService.generateNode(contentId, {
          type,
          userPrompt: userPrompt.trim() || undefined,
        })
        generateMoreByNodeIdRef.current.set(nodeId, key)
        generateMoreRetryRef.current = { type, userPrompt, outputKey: key }
        setGenerateMorePending({ nodeId, type, userPrompt })
      } catch {
        toast.error("Could not start generation.")
        generateMoreRetryRef.current = { type, userPrompt, outputKey: key }
        setIsGeneratingMore(false)
        setRunState(key, {
          phase: "error",
          errorMessage: "Could not start generation.",
        })
      }
    },
    [contentId, setRunState]
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

  function openRerun(key: OutputKey) {
    if (globalRerunning || isGeneratingMore) return
    setRerunPanelKey(key)
    setRerunPromptDraft(getNodePrompt(key))
    setRunByKey((prev) => ({ ...prev, [key]: emptyRunState() }))
  }

  async function submitRerun(key: OutputKey) {
    if (isGeneratingMore) {
      toast.error("Wait for the current generation to finish.")
      return
    }
    generateMoreRetryRef.current = null
    const nodeId = resolveNodeId(workflowNodes, key)
    if (!nodeId || !contentId) {
      toast.error("Could not resolve node for this output.")
      return
    }
    setGlobalRerunning(true)
    setApproveEnabled(false)
    setRunState(key, { phase: "running", stream: "", errorMessage: "" })
    try {
      await contentService.rerunNode(contentId, {
        nodeId,
        updatedPrompt: rerunPromptDraft.trim() || undefined,
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
      setRerunPanelKey(null)
    } catch {
      toast.error("Could not start re-run.")
      setGlobalRerunning(false)
      setRunState(key, {
        phase: "error",
        errorMessage: "Could not start re-run.",
      })
    }
  }

  async function uploadMedia(key: "image" | "video", file: File) {
    const label = key === "image" ? "image" : "video"
    setRunState(key, {
      phase: "running",
      processingMessage: `Uploading ${label}…`,
    })
    try {
      const { url } = await uploadMediaService.uploadFile(file)
      updateOutput(key, url)
      setRunState(key, emptyRunState())
    } catch {
      setRunState(key, {
        phase: "error",
        errorMessage: "Upload failed. Try again.",
      })
      toast.error("Media upload failed.")
    }
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
          setGenMorePromptDraft("")
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
        className="w-[min(100vw-2rem,360px)] p-4"
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
                  onClick={() => setSelectedGenType(t)}
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
            <Textarea
              value={genMorePromptDraft}
              onChange={(e) => setGenMorePromptDraft(e.target.value)}
              placeholder="Optional instructions for this generation…"
              className="min-h-[88px] resize-y border-[#c6880c] text-sm"
            />
            <Button
              type="button"
              size="sm"
              className="h-9 w-full bg-[#254C94] text-white hover:bg-[#1A3260]"
              disabled={blockPipeline}
              onClick={() =>
                void submitGenerateMore(selectedGenType, genMorePromptDraft)
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
      <div className="relative flex min-h-0 flex-1 flex-col bg-[color:var(--nt-canvas)]">
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
                    {orderedVisibleKeys.map((key, cardIndex) => {
                      const run = runByKey[key] ?? emptyRunState()
                      const nodeId = resolveNodeId(workflowNodes, key)
                      const wfNode = workflowNodes.find(
                        (x) => x.nodeId === nodeId
                      )
                      const displayText =
                        run.phase === "streaming" || run.phase === "running"
                          ? run.stream ||
                            (run.phase === "running"
                              ? ""
                              : (editedOutputs[key] ?? ""))
                          : (editedOutputs[key] ?? "")

                      return (
                        <UploadGenerationDraggableCard
                          key={key}
                          nodeKey={key}
                          cardIndex={cardIndex}
                          editedOutputs={editedOutputs}
                          run={run}
                          displayText={displayText}
                          globalRerunning={globalRerunning}
                          blockPipeline={blockPipeline}
                          wfNode={wfNode}
                          nodeId={nodeId}
                          onOpenRerun={openRerun}
                          onSubmitRerun={submitRerun}
                          onRetry={() => {
                            const r = generateMoreRetryRef.current
                            if (r?.outputKey === key) {
                              void submitGenerateMore(r.type, r.userPrompt)
                              return
                            }
                            void submitRerun(key)
                          }}
                          updateOutput={updateOutput}
                          setRunState={setRunState}
                          setLightboxUrl={setLightboxUrl}
                          uploadMedia={uploadMedia}
                          onCopyOutput={(t) => void copyOutput(t)}
                        />
                      )
                    })}
                  </div>
                  {visibleKeys.size === 0 ? (
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
                {orderedVisibleKeys.map((key, cardIndex) => {
                  const run = runByKey[key] ?? emptyRunState()
                  const isTextLike =
                    key === "text" ||
                    key === "translatedText" ||
                    key === "transcription" ||
                    key === "summary"
                  const nodeId = resolveNodeId(workflowNodes, key)
                  const wfNode = workflowNodes.find((x) => x.nodeId === nodeId)
                  const highlight =
                    run.phase === "running" ||
                    run.phase === "streaming" ||
                    run.phase === "processing" ||
                    run.phase === "retrying"
                      ? "ring-2 ring-[#00C9A7]/35"
                      : run.phase === "error"
                        ? "ring-2 ring-red-400/70"
                        : ""

                  const displayText =
                    run.phase === "streaming" || run.phase === "running"
                      ? run.stream ||
                        (run.phase === "running"
                          ? ""
                          : (editedOutputs[key] ?? ""))
                      : (editedOutputs[key] ?? "")

                  const hasBodyOutput =
                    key === "image"
                      ? !!editedOutputs.image
                      : key === "video"
                        ? !!editedOutputs.video
                        : isNonEmptyOutput(displayText)

                  return (
                    <ContentDetailNodeCard
                      key={key}
                      nodeKey={key}
                      cardIndex={cardIndex}
                      run={run}
                      editedOutputs={editedOutputs}
                      globalRerunning={blockPipeline}
                      displayText={displayText}
                      hasBodyOutput={hasBodyOutput}
                      isTextLike={isTextLike}
                      highlight={highlight}
                      wfNode={wfNode}
                      nodeId={nodeId}
                      onCopyOutput={(t) => void copyOutput(t)}
                      onOpenRerun={openRerun}
                      onSubmitRerun={submitRerun}
                      onRetry={() => {
                        const r = generateMoreRetryRef.current
                        if (r?.outputKey === key) {
                          void submitGenerateMore(r.type, r.userPrompt)
                          return
                        }
                        void submitRerun(key)
                      }}
                      updateOutput={updateOutput}
                      setRunState={setRunState}
                      setLightboxUrl={setLightboxUrl}
                      uploadMedia={uploadMedia}
                    />
                  )
                })}
              </div>

              {visibleKeys.size === 0 ? (
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
              runByKey={runByKey}
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
          openKey={rerunPanelKey}
          workflowNodes={workflowNodes}
          globalRerunning={blockPipeline}
          draft={rerunPromptDraft}
          onDraftChange={setRerunPromptDraft}
          onOpenChange={(open) => {
            if (!open) setRerunPanelKey(null)
          }}
          onSubmit={(k) => void submitRerun(k)}
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
