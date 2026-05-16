import { useEffect, useMemo, useRef, useState } from "react"
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom"
import { ChevronDown, ChevronUp, FileStack, Home, Library } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { PromptArea, type Attachment } from "@/components/core/prompt-area"
import {
  WorkflowFlowCanvas,
  type WorkflowFlowCanvasHandle,
} from "@/features/workflow/components/workflow-flow-canvas"
import { WorkflowFlowSkeleton } from "@/features/workflow/components/workflow-flow-skeleton"
import { WorkflowGenerationProgress } from "@/features/workflow/components/workflow-generation-progress"
import { WorkflowPalette } from "@/features/workflow/components/workflow-palette"
import { WorkflowContentDrawer } from "@/features/workflow/components/workflow-content-drawer"
import { WorkflowToolbar } from "@/features/workflow/components/workflow-toolbar"
import { rfNodesToApiPayload } from "@/features/workflow/data/workflow-model"
import { useContentPageQuery } from "@/shared/queries/content.query"
import {
  useGenerateWorkflow,
  useGetWorkflowByRuleIdQuery,
  useRegenerateWorkflowByRuleMutation,
  useSaveWorkflowNodesMutation,
} from "@/shared/queries/workflow.query"
import {
  useGetPipelineQuery,
  usePipelinePageQuery,
  useRetryNodeMutation,
  useStartPipelineMutation,
} from "@/shared/queries/pipeline.query"
import {
  joinPipelineRoom,
  leavePipelineRoom,
  onNodeCompleted,
  onNodeFailedFinal,
  onNodeProcessing,
  onNodeRetrying,
  onNodeStarted,
  onNodeStreaming,
  onPipelineCompleted,
  onPipelineFailed,
  onPipelinePaused,
  onPipelineStarted,
} from "@/shared/socket/pipeline-events"
import {
  joinWorkflowRoom,
  leaveWorkflowRoom,
  onWorkflowCompleted,
  onWorkflowFailed,
  onWorkflowGenerating,
  onWorkflowStarted,
} from "@/shared/socket/workflow-events"
import type { WorkflowNode } from "@/shared/types/workflow.type"
import type { ContentPageItem } from "@/shared/types/content.type"
import type {
  PipelinePageItem,
  PipelineNodeSnapshot,
} from "@/shared/types/pipeline.type"
import { T } from "@/lib/tokens"

type GenerationStep = "started" | "generating" | "failed"
type RouteState = {
  generating?: boolean
  ruleName?: string
  /** Carried from home / workflow-prompt so the pipeline bar is pre-filled */
  contentPrompt?: string
}
type ProcessingMode = "edit" | "processing" | "failed"

export default function WorkflowPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { ruleId } = useParams<{ ruleId: string }>()
  const routeState = (location.state ?? {}) as RouteState

  const initialNavContentPrompt =
    typeof routeState.contentPrompt === "string"
      ? routeState.contentPrompt.trim()
      : ""

  const [wfName, setWfName] = useState("Untitled Workflow")
  const [ruleName, setRuleName] = useState<string | undefined>(
    routeState.ruleName
  )
  const [activeWorkflowId, setActiveWorkflowId] = useState<string | undefined>(
    undefined
  )
  const [workflowPrompt, setWorkflowPrompt] = useState(initialNavContentPrompt)
  const [showWorkflowPrompt, setShowWorkflowPrompt] = useState(false)
  const [rebuildDialogOpen, setRebuildDialogOpen] = useState(false)
  const [rebuildBrief, setRebuildBrief] = useState("")
  const [hovPalette, setHovPalette] = useState<number | null>(null)
  const [apiNodes, setApiNodes] = useState<WorkflowNode[] | undefined>(
    undefined
  )
  const [failureMessage, setFailureMessage] = useState("")
  const [processingMode, setProcessingMode] = useState<ProcessingMode>("edit")
  const [pipelineId, setPipelineId] = useState<string | undefined>(
    searchParams.get("pipelineId") ?? undefined
  )
  const [pipelineFailedMessage, setPipelineFailedMessage] = useState("")
  const [pipelinePaused, setPipelinePaused] = useState(false)
  const [totalNodes, setTotalNodes] = useState<number | null>(null)
  const [completedNodes, setCompletedNodes] = useState(0)
  const [nodeRuntimeById, setNodeRuntimeById] = useState<
    Record<string, Record<string, unknown>>
  >({})
  const [contentDrawerOpen, setContentDrawerOpen] = useState(false)
  const [contentPage, setContentPage] = useState(1)
  const [contentItems, setContentItems] = useState<ContentPageItem[]>([])
  const [contentTotalPages, setContentTotalPages] = useState(0)
  const [pipelinePage, setPipelinePage] = useState(1)
  const [pipelineItems, setPipelineItems] = useState<PipelinePageItem[]>([])
  const [pipelineTotalPages, setPipelineTotalPages] = useState(0)
  const [pipelineListCollapsed, setPipelineListCollapsed] = useState(false)
  const [selectedSnapshotPipelineId, setSelectedSnapshotPipelineId] =
    useState<string>()
  const pipelinePromptHydratedRef = useRef(false)
  const completedNodeIdsRef = useRef<Set<string>>(new Set())

  const [generationStep, setGenerationStep] = useState<GenerationStep | null>(
    routeState.generating ? "started" : null
  )

  const canvasRef = useRef<WorkflowFlowCanvasHandle>(null)
  /** True after submit until completed/failed or nodes arrive (matches rule page processingRuleId pattern). */
  const generationInFlightRef = useRef(false)
  /** Id used to filter socket events; updated synchronously on adopt so rapid events are not dropped before React re-renders. */
  const workflowEventTargetRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    workflowEventTargetRef.current = activeWorkflowId
  }, [activeWorkflowId])

  const generateWorkflow = useGenerateWorkflow()
  const regenerateWorkflowByRule = useRegenerateWorkflowByRuleMutation()
  const saveNodesMutation = useSaveWorkflowNodesMutation()
  const startPipelineMutation = useStartPipelineMutation()
  const retryNodeMutation = useRetryNodeMutation()
  const runningPipelineQuery = useGetPipelineQuery(pipelineId)
  const selectedPipelineSnapshotQuery = useGetPipelineQuery(
    selectedSnapshotPipelineId
  )
  const pipelinePageQuery = usePipelinePageQuery(
    {
      page: pipelinePage,
      limit: 5,
      filter: activeWorkflowId ? { workflowRef: activeWorkflowId } : undefined,
      sortBy: "startedAt",
      sortOrder: "desc",
    },
    !!activeWorkflowId
  )
  const contentPageQuery = useContentPageQuery(
    {
      page: contentPage,
      limit: 5,
      filter: activeWorkflowId ? { workflowRef: activeWorkflowId } : undefined,
      sortBy: "updatedAt",
      sortOrder: "desc",
    },
    contentDrawerOpen && !!activeWorkflowId
  )

  const workflowByRuleQuery = useGetWorkflowByRuleIdQuery(ruleId, {
    refetchInterval:
      generationStep && generationStep !== "failed" ? 2000 : false,
  })

  useEffect(() => {
    if (routeState.ruleName) setRuleName(routeState.ruleName)
  }, [routeState.ruleName])

  useEffect(() => {
    const p = routeState.contentPrompt?.trim()
    if (!p) return
    setWorkflowPrompt(p)
  }, [routeState.contentPrompt])

  useEffect(() => {
    if (!ruleId || !workflowByRuleQuery.isFetched) return

    const data = workflowByRuleQuery.data

    if (data == null) {
      setActiveWorkflowId(undefined)
      setApiNodes([])
      setWfName("Untitled Workflow")
      return
    }

    const wf = data.workflow
    if (!wf?.workflowId) {
      setActiveWorkflowId(undefined)
      setApiNodes([])
      setWfName("Untitled Workflow")
      return
    }

    setActiveWorkflowId(wf.workflowId)
    if (wf.name) setWfName(wf.name)

    if (wf.status === "failed") {
      generationInFlightRef.current = false
      setGenerationStep("failed")
      setFailureMessage("Could not generate workflow. Please try again.")
      return
    }

    // Server may still return pre-regeneration node rows while status is generating;
    // never treat that snapshot as "ready" or clear the progress overlay.
    if (wf.status === "generating") {
      setApiNodes([])
      setGenerationStep("generating")
      return
    }

    const nodes = data.nodes ?? []
    if (nodes.length > 0) {
      setApiNodes(nodes)
      setGenerationStep(null)
      generationInFlightRef.current = false
      return
    }

    setApiNodes([])
    setGenerationStep(null)
  }, [ruleId, workflowByRuleQuery.data, workflowByRuleQuery.isFetched])

  useEffect(() => {
    setContentPage(1)
    setContentItems([])
    setContentTotalPages(0)
  }, [activeWorkflowId])

  useEffect(() => {
    setPipelinePage(1)
    setPipelineItems([])
    setPipelineTotalPages(0)
    setSelectedSnapshotPipelineId(undefined)
    pipelinePromptHydratedRef.current = false
  }, [activeWorkflowId])

  useEffect(() => {
    const payload = contentPageQuery.data
    if (!payload) return
    setContentTotalPages(payload.meta.totalPages)
    setContentItems((prev) => {
      if (contentPage === 1) return payload.data
      const seen = new Set(prev.map((item) => item.contentId))
      const appended = payload.data.filter((item) => !seen.has(item.contentId))
      return [...prev, ...appended]
    })
  }, [contentPage, contentPageQuery.data])

  useEffect(() => {
    const payload = pipelinePageQuery.data
    if (!payload) return
    setPipelineTotalPages(payload.meta.totalPages)
    setPipelineItems((prev) => {
      if (pipelinePage === 1) return payload.data
      const seen = new Set(prev.map((item) => item.pipelineId))
      const appended = payload.data.filter((item) => !seen.has(item.pipelineId))
      return [...prev, ...appended]
    })
    if (!pipelinePromptHydratedRef.current && payload.data.length > 0) {
      setWorkflowPrompt((prev) =>
        prev.trim()
          ? prev
          : (payload.data[0].contentPrompt ?? "")
      )
      pipelinePromptHydratedRef.current = true
    }
  }, [pipelinePage, pipelinePageQuery.data])

  useEffect(() => {
    if (!runningPipelineQuery.data || !pipelineId) return
    const snap = runningPipelineQuery.data
    const runtime: Record<string, Record<string, unknown>> = {}
    const completed = new Set<string>()
    for (const node of snap.nodes) {
      const normalizedStatus =
        node.status === "failed"
          ? "failed_final"
          : node.status === "completed"
            ? "completed"
            : node.status
      const merged = outputToRuntime(node.type, node.output)
      runtime[node.nodeId] = {
        status: normalizedStatus,
        ...merged,
      }
      if (node.status === "completed") completed.add(node.nodeId)
    }
    completedNodeIdsRef.current = completed
    setNodeRuntimeById(runtime)
    setTotalNodes(snap.nodes.length)
    setCompletedNodes(completed.size)
    if (snap.pipeline.status === "paused") {
      setPipelinePaused(true)
      setProcessingMode("processing")
    } else if (snap.pipeline.status === "running") {
      setPipelinePaused(false)
      setProcessingMode("processing")
    } else if (snap.pipeline.status === "failed") {
      setPipelineFailedMessage("Something went wrong. Please try again.")
      setProcessingMode("failed")
    } else if (snap.pipeline.status === "completed") {
      setProcessingMode("processing")
    }
  }, [pipelineId, runningPipelineQuery.data])

  useEffect(() => {
    const snap = selectedPipelineSnapshotQuery.data
    if (!snap || !selectedSnapshotPipelineId) return
    const snapshotNodes = mapPipelineSnapshotNodesToWorkflowNodes(
      snap.nodes,
      snap.pipeline.workflowRef
    )
    if (snapshotNodes.length > 0) {
      setApiNodes(snapshotNodes)
    }
    setWorkflowPrompt(snap.pipeline.contentPrompt ?? "")
  }, [selectedSnapshotPipelineId, selectedPipelineSnapshotQuery.data])

  // Stay in the workflow socket room while this workflow id is active (incl. after complete) so regeneration events are received.
  useEffect(() => {
    if (!activeWorkflowId) return
    joinWorkflowRoom(activeWorkflowId)
    return () => leaveWorkflowRoom(activeWorkflowId)
  }, [activeWorkflowId])

  useEffect(() => {
    if (!pipelineId) return
    joinPipelineRoom(pipelineId)
    return () => leavePipelineRoom(pipelineId)
  }, [pipelineId])

  // Subscribe once; adopt workflow id from first event when HTTP has not set state yet (fixes race before onSuccess).
  useEffect(() => {
    function allowsWorkflowSocket(id: string): boolean {
      const known = workflowEventTargetRef.current
      if (known !== undefined) return id === known
      if (!generationInFlightRef.current) return false
      workflowEventTargetRef.current = id
      setActiveWorkflowId(id)
      joinWorkflowRoom(id)
      return true
    }

    const cleanups = [
      onWorkflowStarted(({ workflowId: id }) => {
        if (!allowsWorkflowSocket(id)) return
        setGenerationStep("started")
      }),
      onWorkflowGenerating(({ workflowId: id }) => {
        if (!allowsWorkflowSocket(id)) return
        setGenerationStep("generating")
      }),
      onWorkflowCompleted(({ workflowId: id, nodes }) => {
        if (!allowsWorkflowSocket(id)) return
        generationInFlightRef.current = false
        setApiNodes(nodes)
        setGenerationStep(null)
      }),
      onWorkflowFailed(({ workflowId: id, message }) => {
        if (!allowsWorkflowSocket(id)) return
        generationInFlightRef.current = false
        setFailureMessage(
          message ?? "Could not generate workflow. Please try again."
        )
        setGenerationStep("failed")
      }),
    ]

    return () => cleanups.forEach((fn) => fn())
  }, [])

  useEffect(() => {
    if (!pipelineId) return
    const cleanups = [
      onPipelineStarted(({ pipelineId: id, totalNodes: total }) => {
        if (id !== pipelineId) return
        setTotalNodes(total)
        setCompletedNodes(0)
        completedNodeIdsRef.current.clear()
      }),
      onNodeStarted(({ pipelineId: id, nodeId }) => {
        if (id !== pipelineId) return
        setNodeRuntimeById((prev) => ({
          ...prev,
          [nodeId]: {
            ...(prev[nodeId] ?? {}),
            status: "running",
            processingMessage: "Generating...",
            errorMessage: undefined,
          },
        }))
      }),
      onNodeStreaming(({ pipelineId: id, nodeId, chunk }) => {
        if (id !== pipelineId) return
        setNodeRuntimeById((prev) => ({
          ...prev,
          [nodeId]: {
            ...(prev[nodeId] ?? {}),
            status: "streaming",
            previewText: `${String(prev[nodeId]?.previewText ?? "")}${chunk}`,
          },
        }))
      }),
      onNodeProcessing(({ pipelineId: id, nodeId, message }) => {
        if (id !== pipelineId) return
        setNodeRuntimeById((prev) => ({
          ...prev,
          [nodeId]: {
            ...(prev[nodeId] ?? {}),
            status: "processing",
            processingMessage: message,
          },
        }))
      }),
      onNodeRetrying(({ pipelineId: id, nodeId, attempt, maxAttempts }) => {
        if (id !== pipelineId) return
        setNodeRuntimeById((prev) => ({
          ...prev,
          [nodeId]: {
            ...(prev[nodeId] ?? {}),
            status: "retrying",
            retryAttempt: attempt,
            retryMaxAttempts: maxAttempts,
            processingMessage: `Retrying... attempt ${attempt}/${maxAttempts}`,
          },
        }))
      }),
      onNodeCompleted(({ pipelineId: id, nodeId, nodeType, output }) => {
        if (id !== pipelineId) return
        setNodeRuntimeById((prev) => ({
          ...prev,
          [nodeId]: {
            ...(prev[nodeId] ?? {}),
            status: "completed",
            ...outputToRuntime(nodeType, output),
            processingMessage: undefined,
            errorMessage: undefined,
          },
        }))
        if (!completedNodeIdsRef.current.has(nodeId)) {
          completedNodeIdsRef.current.add(nodeId)
          setCompletedNodes(completedNodeIdsRef.current.size)
        }
      }),
      onNodeFailedFinal(({ pipelineId: id, nodeId, message }) => {
        if (id !== pipelineId) return
        setNodeRuntimeById((prev) => ({
          ...prev,
          [nodeId]: {
            ...(prev[nodeId] ?? {}),
            status: "failed_final",
            errorMessage: message,
            processingMessage: undefined,
          },
        }))
      }),
      onPipelinePaused(({ pipelineId: id }) => {
        if (id !== pipelineId) return
        setPipelinePaused(true)
      }),
      onPipelineCompleted(({ pipelineId: id, contentId, uploadId }) => {
        if (id !== pipelineId) return
        setPipelinePaused(false)
        setTimeout(() => {
          leavePipelineRoom(id)
          setSearchParams((params) => {
            params.delete("pipelineId")
            return params
          })
          navigate(
            uploadId ? `/upload/${uploadId}` : `/content/${contentId}`
          )
        }, 1000)
      }),
      onPipelineFailed(({ pipelineId: id, message }) => {
        if (id !== pipelineId) return
        setPipelinePaused(false)
        setPipelineFailedMessage(
          message ?? "Something went wrong. Please try again."
        )
        setProcessingMode("failed")
      }),
    ]
    return () => cleanups.forEach((fn) => fn())
  }, [navigate, pipelineId, setSearchParams])

  function handleSave() {
    if (!activeWorkflowId || !ruleId) return
    const rfNodes = canvasRef.current?.getRfNodes() ?? []
    const rfEdges = canvasRef.current?.getRfEdges() ?? []
    saveNodesMutation.mutate({
      workflowId: activeWorkflowId,
      ruleId,
      nodes: rfNodesToApiPayload(rfNodes, rfEdges),
    })
  }

  function handleStartPipeline(contentPromptOverride?: string) {
    if (!activeWorkflowId || !ruleId) return
    const contentPrompt = (contentPromptOverride ?? workflowPrompt).trim()
    if (!contentPrompt) {
      toast.error("Please enter what you want to post about.")
      return
    }
    startPipelineMutation.mutate(
      { workflowId: activeWorkflowId, ruleId, contentPrompt },
      {
        onSuccess: ({ pipelineId: id }) => {
          setPipelineId(id)
          setSearchParams((params) => {
            params.set("pipelineId", id)
            return params
          })
          setProcessingMode("processing")
          setPipelinePaused(false)
          setTotalNodes(apiNodes?.length ?? null)
          setCompletedNodes(0)
          completedNodeIdsRef.current.clear()
          setNodeRuntimeById(() =>
            Object.fromEntries(
              (apiNodes ?? []).map((n) => [n.nodeId, { status: "pending" }])
            )
          )
          joinPipelineRoom(id)
        },
        onError: () => {
          toast.error("Could not start pipeline. Please try again.")
        },
      }
    )
  }

  function handleBottomPromptSubmit(text: string, _attachments: Attachment[]) {
    if (canvasMode === "empty") {
      handleWorkflowGenerateSubmit(text, _attachments)
      return
    }
    if (canvasMode === "ready") {
      handleStartPipeline(text.trim())
    }
  }

  function handleCancelPipeline() {
    if (pipelineId) leavePipelineRoom(pipelineId)
    setPipelineId(undefined)
    setSearchParams((params) => {
      params.delete("pipelineId")
      return params
    })
    setProcessingMode("edit")
    setPipelinePaused(false)
    setPipelineFailedMessage("")
    setNodeRuntimeById({})
    setCompletedNodes(0)
    completedNodeIdsRef.current.clear()
    setTotalNodes(null)
  }

  function handleRetryNode(nodeId: string) {
    if (!pipelineId) return
    retryNodeMutation.mutate(
      { pipelineId, payload: { nodeId } },
      {
        onSuccess: () => {
          setPipelinePaused(false)
          setNodeRuntimeById((prev) => ({
            ...prev,
            [nodeId]: {
              ...(prev[nodeId] ?? {}),
              status: "running",
              errorMessage: undefined,
              processingMessage: "Generating...",
            },
          }))
        },
        onError: () => {
          toast.error("Could not retry. Please try again.")
        },
      }
    )
  }

  function handleWorkflowGenerateSubmit(
    text: string,
    _attachments: Attachment[]
  ) {
    const contentPrompt = text.trim()
    if (!ruleId) return
    if (!contentPrompt) {
      toast.error("Please describe what workflow should be generated.")
      return
    }
    generationInFlightRef.current = true
    setGenerationStep("started")
    if (activeWorkflowId) joinWorkflowRoom(activeWorkflowId)

    const onSuccess = (data: { workflowId: string }) => {
      workflowEventTargetRef.current = data.workflowId
      setActiveWorkflowId(data.workflowId)
      setApiNodes([])
      setGenerationStep("generating")
      joinWorkflowRoom(data.workflowId)
      navigate(`/workflow/${ruleId}`, {
        replace: true,
        state: {
          ruleName,
          generating: true,
          contentPrompt,
        },
      })
      void workflowByRuleQuery.refetch()
    }

    if (activeWorkflowId) {
      regenerateWorkflowByRule.mutate({ contentPrompt, ruleId }, { onSuccess })
      return
    }

    generateWorkflow.mutate({ contentPrompt, ruleId }, { onSuccess })
  }

  function handleConfirmRebuild() {
    if (!ruleId) return
    const contentPrompt =
      rebuildBrief.trim() ||
      "Refresh workflow nodes from the current rule and channel settings."
    setRebuildDialogOpen(false)
    setRebuildBrief("")
    handleWorkflowGenerateSubmit(contentPrompt, [])
  }

  function handleSelectPipelineSnapshot(item: PipelinePageItem) {
    if (!item.pipelineId) return
    setSelectedSnapshotPipelineId(item.pipelineId)
    setWorkflowPrompt(item.contentPrompt ?? "")
  }

  const canvasMode = useMemo(() => {
    if (
      generationStep &&
      generationStep !== "failed" &&
      (!apiNodes || apiNodes.length === 0)
    )
      return "loading"
    if (workflowByRuleQuery.isLoading && (!apiNodes || apiNodes.length === 0))
      return "loading"
    if (workflowByRuleQuery.isFetched && workflowByRuleQuery.data == null)
      return "empty"
    if (!apiNodes || apiNodes.length === 0) return "empty"
    return "ready"
  }, [
    apiNodes,
    generationStep,
    ruleId,
    workflowByRuleQuery.data,
    workflowByRuleQuery.isFetched,
    workflowByRuleQuery.isLoading,
  ])

  useEffect(() => {
    if (canvasMode === "ready") {
      setShowWorkflowPrompt(true)
    } else if (canvasMode === "empty") {
      setShowWorkflowPrompt(false)
    }
  }, [canvasMode])

  const progressPercent = useMemo(() => {
    if (!totalNodes || totalNodes <= 0) return null
    return Math.round((completedNodes / totalNodes) * 100)
  }, [completedNodes, totalNodes])

  if (!ruleId) {
    return (
      <div
        className="flex min-h-0 flex-1 flex-col items-center justify-center p-6"
        style={{ background: T.canvasBg }}
      >
        <p className="text-sm" style={{ color: T.textSecondary }}>
          Invalid workflow URL. Open a workflow from Rules.
        </p>
        <button
          type="button"
          className="mt-4 text-sm font-medium underline"
          style={{ color: T.accent }}
          onClick={() => navigate("/rules")}
        >
          Go to Rules
        </button>
      </div>
    )
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      style={{ background: T.canvasBg }}
    >
      <WorkflowToolbar
        wfName={wfName}
        onWfNameChange={setWfName}
        ruleName={ruleName}
        onRuleClick={() =>
          navigate("/rules", { state: { selectedRuleId: ruleId } })
        }
        onToggleStructurePrompt={
          canvasMode === "empty" && processingMode === "edit"
            ? () => setShowWorkflowPrompt((v) => !v)
            : undefined
        }
        structurePromptOpen={canvasMode === "empty" ? showWorkflowPrompt : undefined}
        onRebuildWorkflow={
          canvasMode === "ready" && processingMode === "edit"
            ? () => setRebuildDialogOpen(true)
            : undefined
        }
        onRun={handleStartPipeline}
        runLabel="Generate content"
        onSave={
          activeWorkflowId && processingMode === "edit" ? handleSave : undefined
        }
        isSaving={saveNodesMutation.isPending}
        readOnly={processingMode === "processing"}
        showCancel={processingMode === "processing"}
        onCancel={handleCancelPipeline}
      />

      {processingMode === "processing" ? (
        <div className="border-b bg-white px-4 py-2">
          {pipelinePaused ? (
            <div className="mb-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Pipeline paused - please retry the failed node to continue.
            </div>
          ) : null}
          <div className="mb-1 flex items-center justify-between text-xs text-gray-600">
            <span>
              {progressPercent == null
                ? "Running..."
                : `${completedNodes} of ${totalNodes ?? 0} nodes completed`}
            </span>
            <span>
              {progressPercent == null ? "..." : `${progressPercent}%`}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded bg-gray-200">
            <div
              className="h-full rounded bg-emerald-500 transition-all"
              style={{
                width: progressPercent == null ? "35%" : `${progressPercent}%`,
              }}
            />
          </div>
        </div>
      ) : null}

      {processingMode === "failed" ? (
        <div className="m-4 rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          <div>
            {pipelineFailedMessage || "Something went wrong. Please try again."}
          </div>
          <button
            type="button"
            className="mt-2 rounded border border-red-400 px-3 py-1 text-xs"
            onClick={() => {
              setProcessingMode("edit")
              setPipelineFailedMessage("")
              if (pipelineId) leavePipelineRoom(pipelineId)
              setPipelineId(undefined)
              setSearchParams((params) => {
                params.delete("pipelineId")
                return params
              })
            }}
          >
            Start Over
          </button>
        </div>
      ) : null}

      <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
        {processingMode === "edit" ? (
          <WorkflowPalette hovPalette={hovPalette} onHover={setHovPalette} />
        ) : null}
        {canvasMode === "loading" ? (
          <WorkflowFlowSkeleton />
        ) : canvasMode === "empty" ? (
          <div className="flex min-h-0 w-full flex-1 items-center justify-center">
            <div className="max-w-md text-center">
              <h2
                className="text-lg font-semibold"
                style={{ color: T.textPrimary }}
              >
                Start your workflow
              </h2>
              <p className="mt-2 text-sm" style={{ color: T.textSecondary }}>
                Open <span className="font-medium">Describe workflow</span> in the toolbar, then describe
                channels, formats, or goals. Node-level prompts are not stored here—the topic for each post is
                entered when you run <span className="font-medium">Generate content</span>.
              </p>
            </div>
          </div>
        ) : (
          <WorkflowFlowCanvas
            ref={canvasRef}
            apiNodes={apiNodes}
            readOnly={processingMode === "processing"}
            runtimeById={nodeRuntimeById}
            onRetryNode={handleRetryNode}
          />
        )}
        {processingMode === "edit" &&
        showWorkflowPrompt &&
        (canvasMode === "empty" || canvasMode === "ready") ? (
          <div className="pointer-events-none absolute bottom-0 left-1/2 z-20 flex w-full -translate-x-1/2 justify-center px-4 pb-4">
            <div className="pointer-events-auto w-full max-w-[760px] rounded-2xl border border-canvas-200 bg-white/95 p-2 shadow-lg backdrop-blur">
              <p className="px-2 pb-1 text-xs font-medium text-canvas-500">
                {canvasMode === "empty"
                  ? "Describe this workflow (structure)"
                  : "What do you want to post about?"}
              </p>
              <PromptArea
                value={workflowPrompt}
                onChange={setWorkflowPrompt}
                onSubmit={handleBottomPromptSubmit}
                placeholder={
                  canvasMode === "empty"
                    ? "e.g. Instagram + Facebook captions, Thai translation, hero image…"
                    : "e.g. Our Christmas sale — 50% off all items until Dec 25…"
                }
                className="shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
              />
              {canvasMode === "ready" ? (
                <p className="px-2 pt-1 text-[11px] text-canvas-500">
                  Using workflow: <span className="font-medium text-canvas-700">{wfName}</span> ·{" "}
                  {apiNodes?.length ?? 0} {apiNodes?.length === 1 ? "node" : "nodes"}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {processingMode === "edit" && activeWorkflowId ? (
          <div className="absolute top-3 right-3 z-10 w-[320px] rounded-xl border border-canvas-200 bg-white/95 p-3 shadow-lg backdrop-blur">
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setPipelineListCollapsed((v) => !v)}
                className="flex items-center gap-2 text-sm font-semibold text-canvas-800"
              >
                <span>Used Pipelines</span>
                {pipelineListCollapsed ? (
                  <ChevronDown className="size-4 text-canvas-500" />
                ) : (
                  <ChevronUp className="size-4 text-canvas-500" />
                )}
              </button>
              <span className="text-xs text-canvas-500">
                {pipelineItems.length}/{pipelinePageQuery.data?.meta.total ?? 0}
              </span>
            </div>
            {!pipelineListCollapsed ? (
              <>
                <div className="max-h-[280px] space-y-2 overflow-auto pr-1">
                  {pipelineItems.map((item) => {
                    const selected =
                      selectedSnapshotPipelineId === item.pipelineId
                    return (
                      <button
                        key={item.pipelineId}
                        type="button"
                        onClick={() => handleSelectPipelineSnapshot(item)}
                        className={`w-full rounded-lg border px-2.5 py-2 text-left transition ${
                          selected
                            ? "border-canvas-500 bg-canvas-50"
                            : "border-canvas-200 hover:border-canvas-300 hover:bg-canvas-50/60"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs font-semibold text-canvas-800">
                            {item.status}
                          </span>
                          <span className="text-[10px] text-canvas-500">
                            {new Date(item.startedAt).toLocaleString()}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-canvas-600">
                          {item.contentPrompt}
                        </p>
                        <p className="mt-1 text-[10px] text-canvas-500">
                          {item.nodeCount} nodes
                        </p>
                      </button>
                    )
                  })}
                  {pipelineItems.length === 0 &&
                  !pipelinePageQuery.isLoading ? (
                    <p className="py-3 text-center text-xs text-canvas-500">
                      No pipelines yet for this workflow.
                    </p>
                  ) : null}
                </div>
                {pipelinePage < pipelineTotalPages ? (
                  <button
                    type="button"
                    className="mt-2 w-full rounded-md border border-canvas-300 px-2 py-1.5 text-xs font-medium text-canvas-700 hover:bg-canvas-50 disabled:opacity-60"
                    disabled={pipelinePageQuery.isFetching}
                    onClick={() => setPipelinePage((p) => p + 1)}
                  >
                    {pipelinePageQuery.isFetching ? "Loading..." : "Load more"}
                  </button>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      {generationStep ? (
        <WorkflowGenerationProgress
          step={generationStep}
          failureMessage={failureMessage}
          onRetry={
            generationStep === "failed"
              ? () => navigate("/rules", { state: { selectedRuleId: ruleId } })
              : undefined
          }
        />
      ) : null}

      <div className="pointer-events-none fixed right-6 bottom-6 z-30 flex flex-col gap-2">
        <button
          type="button"
          className="pointer-events-auto flex size-10 items-center justify-center rounded-full border bg-white shadow-sm"
          style={{ borderColor: T.surfaceBorder, color: T.textPrimary }}
          onClick={() => setContentDrawerOpen(true)}
          title="Workflow Contents"
        >
          <Library className="size-4" />
        </button>
        <button
          type="button"
          className="pointer-events-auto flex size-10 items-center justify-center rounded-full border bg-white shadow-sm"
          style={{ borderColor: T.surfaceBorder, color: T.textPrimary }}
          onClick={() => navigate("/")}
          title="Go to Home"
        >
          <Home className="size-4" />
        </button>
        <button
          type="button"
          className="pointer-events-auto flex size-10 items-center justify-center rounded-full border bg-white shadow-sm"
          style={{ borderColor: T.surfaceBorder, color: T.textPrimary }}
          onClick={() =>
            navigate("/rules", { state: { selectedRuleId: ruleId } })
          }
          title="Go to Rules"
        >
          <FileStack className="size-4" />
        </button>
      </div>

      <Dialog open={rebuildDialogOpen} onOpenChange={setRebuildDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Rebuild workflow nodes</DialogTitle>
            <DialogDescription>
              Replaces the current node layout from the rule and your notes. Per-post topics stay in the
              Generate content prompt, not here.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={rebuildBrief}
            onChange={(e) => setRebuildBrief(e.target.value)}
            rows={5}
            placeholder="Optional: channels, formats, translation, media… Leave blank to infer from the rule."
            className="text-sm"
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRebuildDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleConfirmRebuild}
              disabled={regenerateWorkflowByRule.isPending}
            >
              {regenerateWorkflowByRule.isPending ? "Rebuilding…" : "Rebuild"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <WorkflowContentDrawer
        open={contentDrawerOpen}
        onOpenChange={(open) => {
          setContentDrawerOpen(open)
          if (open) {
            setContentPage(1)
            setContentItems([])
          }
        }}
        items={contentItems}
        isLoading={contentPageQuery.isLoading}
        canViewMore={contentPage < contentTotalPages}
        isLoadingMore={contentPageQuery.isFetching && contentPage > 1}
        onViewMore={() => {
          if (contentPageQuery.isFetching) return
          setContentPage((p) => p + 1)
        }}
      />

    </div>
  )
}

function outputToRuntime(
  nodeType: string,
  output: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (!output) return {}
  const textLike =
    typeof output.keywords === "string"
      ? output.keywords
      : typeof output.text === "string"
        ? output.text
        : typeof output.translatedText === "string"
        ? output.translatedText
        : typeof output.transcription === "string"
          ? output.transcription
          : typeof output.summary === "string"
            ? output.summary
            : undefined
  const truncated =
    textLike && textLike.length > 100
      ? `${textLike.slice(0, 100)}...`
      : textLike
  switch (nodeType) {
    case "keyword_planner":
    case "text_generation":
    case "translation":
    case "transcription":
    case "summarization":
      return { previewText: truncated }
    case "image_generation":
      return {
        previewImage:
          typeof output.image === "string"
            ? output.image
            : typeof output.output === "string"
              ? output.output
              : undefined,
      }
    case "video_generation":
      return {
        previewVideo:
          typeof output.video === "string"
            ? output.video
            : typeof output.output === "string"
              ? output.output
              : undefined,
      }
    default:
      return { previewText: truncated }
  }
}

function mapPipelineSnapshotNodesToWorkflowNodes(
  nodes: PipelineNodeSnapshot[],
  workflowRef: string
): WorkflowNode[] {
  return [...nodes]
    .sort((a, b) => a.order - b.order)
    .map((node) => ({
      nodeId: node.nodeId,
      type: node.type,
      order: node.order,
      workflowRef,
      isLocked: node.isLocked,
      config: node.config ?? {},
      createdAt: node.executedAt ?? new Date().toISOString(),
      updatedAt: node.executedAt ?? new Date().toISOString(),
    }))
}
