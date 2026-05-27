import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom"
import { FileStack, Home, Library } from "lucide-react"
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
import { WorkflowContentDrawer } from "@/features/workflow/components/workflow-content-drawer"
import { WorkflowToolbar } from "@/features/workflow/components/workflow-toolbar"
import { WorkflowUsedPipelinesPanel } from "@/features/workflow/components/workflow-used-pipelines-panel"
import { rfNodesToApiPayload } from "@/features/workflow/data/workflow-model"
import type { RuleEntity } from "@/features/rules/data/rules-mock"
import {
  resolveBranchChannels,
  RULE_CHANNELS_BRANCH_CONFIG,
} from "@/features/workflow/lib/branch-channels"
import type { WfRfNode } from "@/features/workflow/data/workflow-model"
import { pipelineGraphToRf } from "@/features/workflow/lib/branch-layout"
import {
  getBranchSubgraphLaneErrors,
  getVideoPresenterErrorsFromRfNodes,
} from "@/features/workflow/lib/workflow-node-validation"
import { navigateAfterPipelineSuccess } from "@/features/workflow/lib/pipeline-completion-nav"
import { useRuleByIdQuery } from "@/shared/queries/rule.query"
import { useContentPageQuery } from "@/shared/queries/content.query"
import {
  useGenerateWorkflow,
  useGetWorkflowByRuleIdQuery,
  useRegenerateWorkflowByRuleMutation,
  usePatchWorkflowMutation,
  useSaveWorkflowNodesByRuleMutation,
  useSaveWorkflowNodesMutation,
} from "@/shared/queries/workflow.query"
import {
  useGetPipelineQuery,
  usePipelinePageQuery,
  useRetryNodeMutation,
  useReplanPipelineMutation,
  useSkipNodeMutation,
  useStartPipelineMutation,
} from "@/shared/queries/pipeline.query"
import { pipelineService } from "@/shared/services/pipeline.service"
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
import type { WorkflowEdge, WorkflowNode } from "@/shared/types/workflow.type"
import type { ContentPageItem } from "@/shared/types/content.type"
import type { PipelinePageItem } from "@/shared/types/pipeline.type"
import { T } from "@/lib/tokens"

type GenerationStep = "started" | "generating" | "failed"
type RouteState = {
  generating?: boolean
  ruleName?: string
  /** Carried from home / workflow-prompt so the pipeline bar is pre-filled */
  contentPrompt?: string
}
type ProcessingMode = "edit" | "processing" | "failed"

type SnapshotBaseline = {
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  prompt: string
}

function normalizeBranchNodesForSave(nodes: WfRfNode[]): WfRfNode[] {
  return nodes.map((n) => {
    if (n.type === "plus_placeholder") return n
    if (n.type !== "branchNode" && n.data.wfType !== "branch") return n
    return {
      ...n,
      data: {
        ...n.data,
        config: RULE_CHANNELS_BRANCH_CONFIG,
      },
    } as WfRfNode
  })
}

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
  const [apiNodes, setApiNodes] = useState<WorkflowNode[] | undefined>(
    undefined
  )
  const [apiEdges, setApiEdges] = useState<WorkflowEdge[] | undefined>(
    undefined,
  )
  const [failureMessage, setFailureMessage] = useState("")
  const [processingMode, setProcessingMode] = useState<ProcessingMode>("edit")
  const [pipelineId, setPipelineId] = useState<string | undefined>(
    searchParams.get("pipelineId") ?? undefined
  )
  const [pipelineFailedMessage, setPipelineFailedMessage] = useState("")
  const [pipelinePaused, setPipelinePaused] = useState(false)
  const [pausedLaneId, setPausedLaneId] = useState<string | null>(null)
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
  const snapshotBaselineRef = useRef<SnapshotBaseline | null>(null)
  const completedNodeIdsRef = useRef<Set<string>>(new Set())
  const pipelineCompletionHandledRef = useRef(false)
  const stuckFinalizeAttemptedRef = useRef(false)
  const [canvasEdited, setCanvasEdited] = useState(false)
  const [configDraftDirty, setConfigDraftDirty] = useState(false)

  const [generationStep, setGenerationStep] = useState<GenerationStep | null>(
    routeState.generating ? "started" : null
  )

  const canvasRef = useRef<WorkflowFlowCanvasHandle>(null)
  /** True after submit until completed/failed or nodes arrive (matches rule page processingRuleId pattern). */
  const generationInFlightRef = useRef(false)
  /** Id used to filter socket events; updated synchronously on adopt so rapid events are not dropped before React re-renders. */
  const workflowEventTargetRef = useRef<string | undefined>(undefined)
  const committedWfNameRef = useRef("Untitled Workflow")
  useEffect(() => {
    workflowEventTargetRef.current = activeWorkflowId
  }, [activeWorkflowId])

  const generateWorkflow = useGenerateWorkflow()
  const regenerateWorkflowByRule = useRegenerateWorkflowByRuleMutation()
  const saveNodesMutation = useSaveWorkflowNodesMutation()
  const saveByRuleMutation = useSaveWorkflowNodesByRuleMutation()
  const patchWorkflowMutation = usePatchWorkflowMutation()
  const startPipelineMutation = useStartPipelineMutation()
  const retryNodeMutation = useRetryNodeMutation()
  const skipNodeMutation = useSkipNodeMutation()
  const replanMutation = useReplanPipelineMutation()
  const runningPipelineQuery = useGetPipelineQuery(pipelineId, {
    refetchInterval:
      processingMode === "processing" && pipelineId ? 2000 : false,
  })
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

  const handlePipelineCompletion = useCallback(
    async (args: {
      pipelineId: string
      contentId?: string
      uploadId?: string
    }) => {
      if (pipelineCompletionHandledRef.current) return
      pipelineCompletionHandledRef.current = true
      setPipelinePaused(false)
      const completedPipelineId = args.pipelineId
      window.setTimeout(async () => {
        leavePipelineRoom(completedPipelineId)
        setSearchParams((params) => {
          params.delete("pipelineId")
          return params
        })
        const navigated = await navigateAfterPipelineSuccess(navigate, {
          pipelineId: completedPipelineId,
          contentId: args.contentId,
          uploadId: args.uploadId,
        })
        if (!navigated) {
          pipelineCompletionHandledRef.current = false
          setProcessingMode("edit")
          setPipelineId(undefined)
        }
      }, 1000)
    },
    [navigate, setSearchParams],
  )

  const workflowByRuleQuery = useGetWorkflowByRuleIdQuery(ruleId, {
    refetchInterval:
      generationStep && generationStep !== "failed" ? 2000 : false,
  })
  const ruleQuery = useRuleByIdQuery<RuleEntity>(ruleId)

  const branchChannels = useMemo(
    () => resolveBranchChannels({ mode: "rule_channels" }, ruleQuery.data?.channels),
    [ruleQuery.data?.channels],
  )

  /** Live run or used-pipeline preview — uses stored graph layout, not template auto-layout. */
  const pipelineCanvasOverride = useMemo(() => {
    const snap =
      processingMode === "processing"
        ? runningPipelineQuery.data
        : selectedSnapshotPipelineId
          ? selectedPipelineSnapshotQuery.data
          : null
    if (!snap || snap.nodes.length === 0) return null
    return pipelineGraphToRf({
      nodes: snap.nodes,
      edges: snap.graph?.edges ?? [],
      lanes: snap.graph?.lanes ?? [],
      layout: snap.graph?.layout,
    })
  }, [
    processingMode,
    runningPipelineQuery.data,
    selectedSnapshotPipelineId,
    selectedPipelineSnapshotQuery.data,
  ])

  useEffect(() => {
    setCanvasEdited(false)
    setConfigDraftDirty(false)
  }, [apiNodes])

  useEffect(() => {
    setCanvasEdited(false)
    setConfigDraftDirty(false)
  }, [activeWorkflowId])

  useEffect(() => {
    if (!selectedSnapshotPipelineId) return
    setCanvasEdited(false)
  }, [selectedSnapshotPipelineId])

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
      committedWfNameRef.current = "Untitled Workflow"
      return
    }

    const wf = data.workflow
    if (!wf?.workflowId) {
      setActiveWorkflowId(undefined)
      setApiNodes([])
      setWfName("Untitled Workflow")
      committedWfNameRef.current = "Untitled Workflow"
      return
    }

    setActiveWorkflowId(wf.workflowId)
    const loadedName = wf.name?.trim() || "Untitled Workflow"
    setWfName(loadedName)
    committedWfNameRef.current = loadedName

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
      setApiEdges(data.edges ?? [])
      setGenerationStep(null)
      generationInFlightRef.current = false
      return
    }

    setApiNodes([])
    setApiEdges([])
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
    snapshotBaselineRef.current = null
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
    stuckFinalizeAttemptedRef.current = false
  }, [pipelineId])

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
        ...(node.lane ? { lane: node.lane } : {}),
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
      setPausedLaneId(snap.pipeline.pausedLaneId ?? null)
      setProcessingMode("processing")
    } else if (snap.pipeline.status === "running") {
      setPipelinePaused(false)
      setPausedLaneId(null)
      setProcessingMode("processing")
      const allTerminal =
        snap.nodes.length > 0 &&
        snap.nodes.every(
          (n) => n.status === "completed" || n.status === "skipped",
        )
      if (allTerminal && completed.size >= snap.nodes.length) {
        if (!stuckFinalizeAttemptedRef.current) {
          stuckFinalizeAttemptedRef.current = true
          void pipelineService
            .tryFinalize(pipelineId)
            .then(() => runningPipelineQuery.refetch())
            .catch(() => {
              stuckFinalizeAttemptedRef.current = false
            })
        } else {
          void runningPipelineQuery.refetch()
        }
      }
    } else if (snap.pipeline.status === "failed") {
      setPipelineFailedMessage(
        "Something went wrong. Please try again.",
      )
      setProcessingMode("failed")
    } else if (snap.pipeline.status === "completed") {
      void handlePipelineCompletion({
        pipelineId,
        contentId: snap.pipeline.contentId,
        uploadId: snap.pipeline.uploadId,
      })
    }
  }, [
    handlePipelineCompletion,
    pipelineId,
    runningPipelineQuery.data,
    runningPipelineQuery.refetch,
  ])

  useEffect(() => {
    const snap = selectedPipelineSnapshotQuery.data
    if (!snap || !selectedSnapshotPipelineId) return
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
      onWorkflowCompleted(({ workflowId: id, nodes, edges }) => {
        if (!allowsWorkflowSocket(id)) return
        generationInFlightRef.current = false
        setApiNodes(nodes)
        if (edges && edges.length > 0) {
          setApiEdges(edges)
        }
        void workflowByRuleQuery.refetch()
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
        void handlePipelineCompletion({ pipelineId: id, contentId, uploadId })
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
  }, [handlePipelineCompletion, pipelineId])

  function handleWfNameCommit() {
    if (!activeWorkflowId || !ruleId) return
    const trimmed = wfName.trim() || "Untitled Workflow"
    if (trimmed !== wfName) setWfName(trimmed)
    if (trimmed === committedWfNameRef.current) return
    patchWorkflowMutation.mutate(
      { workflowId: activeWorkflowId, ruleId, name: trimmed },
      {
        onSuccess: (data) => {
          committedWfNameRef.current = data.name
          setWfName(data.name)
        },
        onError: () => {
          setWfName(committedWfNameRef.current)
        },
      },
    )
  }

  function resetWorkflowEditStateAfterSave() {
    canvasRef.current?.dismissPropertiesPanel()
    setSelectedSnapshotPipelineId(undefined)
    const wfData = workflowByRuleQuery.data
    if (wfData?.nodes?.length) {
      setApiNodes(wfData.nodes)
      setApiEdges(wfData.edges ?? [])
    }
    setCanvasEdited(false)
    setConfigDraftDirty(false)
  }

  function handleSave() {
    if (!ruleId) return
    const rfNodes = canvasRef.current?.getRfNodes() ?? []
    const rfEdges = canvasRef.current?.getRfEdges() ?? []
    let nodesToSave = rfNodes
    let edgesToSave = rfEdges
    let laneErrors = getBranchSubgraphLaneErrors(
      nodesToSave,
      edgesToSave,
      branchChannels.length,
    )
    if (
      laneErrors.some((e) => e.startsWith("Adapt ")) &&
      canvasRef.current?.repairOrphanLaneAdapts()
    ) {
      nodesToSave = canvasRef.current.getRfNodes()
      edgesToSave = canvasRef.current.getRfEdges()
      laneErrors = getBranchSubgraphLaneErrors(
        nodesToSave,
        edgesToSave,
        branchChannels.length,
      )
      toast.info(
        "Replaced unassigned Adapt nodes with one Adapt per channel from Branch.",
      )
    }
    if (branchChannels.length > 0 && branchChannels.length < 2) {
      toast.error(
        "Branch requires at least two distribution channels on the campaign rule.",
      )
      return
    }
    if (laneErrors.length > 0) {
      toast.error(laneErrors[0])
      return
    }
    nodesToSave = normalizeBranchNodesForSave(nodesToSave)
    const payload = rfNodesToApiPayload(nodesToSave, edgesToSave)
    if (payload.nodes.length === 0) {
      toast.error("Add at least one node before saving.")
      return
    }

    if (activeWorkflowId) {
      const name = wfName.trim() || undefined
      saveNodesMutation.mutate(
        {
          workflowId: activeWorkflowId,
          ruleId,
          name,
          nodes: payload.nodes,
          edges: payload.edges,
        },
        {
          onSuccess: () => {
            resetWorkflowEditStateAfterSave()
            if (name) {
              committedWfNameRef.current = name
            }
          },
        },
      )
      return
    }

    const name = wfName.trim() || undefined
    saveByRuleMutation.mutate(
      {
        ruleId,
        name,
        nodes: payload.nodes,
        edges: payload.edges,
      },
      {
        onSuccess: (data) => {
            resetWorkflowEditStateAfterSave()
          setActiveWorkflowId(data.workflowId)
          if (name) committedWfNameRef.current = name
          void workflowByRuleQuery.refetch()
        },
      },
    )
  }

  function runStartPipelineMutation(contentPrompt: string) {
    const useLearnings = searchParams.get("useLearnings") === "1"
    startPipelineMutation.mutate(
      { workflowId: activeWorkflowId!, ruleId: ruleId!, contentPrompt, useLearnings },
      {
        onSuccess: ({ pipelineId: id }) => {
          pipelineCompletionHandledRef.current = false
          stuckFinalizeAttemptedRef.current = false
          setPipelineId(id)
          setSearchParams((params) => {
            params.set("pipelineId", id)
            return params
          })
          setProcessingMode("processing")
          setPipelinePaused(false)
          setTotalNodes(null)
          setCompletedNodes(0)
          completedNodeIdsRef.current.clear()
          setNodeRuntimeById({})
          joinPipelineRoom(id)
        },
        onError: () => {
          toast.error("Could not start pipeline. Please try again.")
        },
      },
    )
  }

  function handleStartPipeline(contentPromptOverride?: string) {
    if (!activeWorkflowId || !ruleId) return
    const contentPrompt = (contentPromptOverride ?? workflowPrompt).trim()
    if (!contentPrompt) {
      toast.error("Please enter what you want to post about.")
      return
    }

    const rfNodes = canvasRef.current?.getRfNodes() ?? []
    const presenterErrors = getVideoPresenterErrorsFromRfNodes(rfNodes)
    if (presenterErrors.length > 0) {
      toast.error(presenterErrors[0])
      return
    }

    const startAfterSave = () => runStartPipelineMutation(contentPrompt)

    if (!canvasEdited && !configDraftDirty) {
      startAfterSave()
      return
    }

    const rfEdges = canvasRef.current?.getRfEdges() ?? []
    let nodesToSave = rfNodes
    let edgesToSave = rfEdges
    nodesToSave = normalizeBranchNodesForSave(nodesToSave)
    const payload = rfNodesToApiPayload(nodesToSave, edgesToSave)
    if (payload.nodes.length === 0) {
      toast.error("Add at least one node before running.")
      return
    }

    saveNodesMutation.mutate(
      {
        workflowId: activeWorkflowId,
        ruleId,
        name: wfName.trim() || undefined,
        nodes: payload.nodes,
        edges: payload.edges,
      },
      {
        onSuccess: () => {
          resetWorkflowEditStateAfterSave()
          startAfterSave()
        },
        onError: () => {
          toast.error("Save the workflow before running (presenter settings were not saved).")
        },
      },
    )
  }

  function handleBottomPromptSubmit(text: string, _attachments: Attachment[]) {
    if (generationUiLocked) return
    if (canvasMode === "empty") {
      handleWorkflowGenerateSubmit(text, _attachments)
      return
    }
    if (canvasMode === "ready") {
      handleStartPipeline(text.trim())
    }
  }

  function handleCancelPipeline() {
    pipelineCompletionHandledRef.current = false
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

  function handleSkipNode(nodeId: string) {
    if (!pipelineId) return
    skipNodeMutation.mutate(
      { pipelineId, payload: { nodeId } },
      {
        onSuccess: () => {
          setPipelinePaused(false)
          setNodeRuntimeById((prev) => ({
            ...prev,
            [nodeId]: {
              ...(prev[nodeId] ?? {}),
              status: "completed",
              errorMessage: undefined,
              processingMessage: undefined,
            },
          }))
        },
        onError: () => {
          toast.error("Could not skip. Please try again.")
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

  function restoreWorkflowCanvasBaseline() {
    const baseline = snapshotBaselineRef.current
    if (baseline) {
      setApiNodes(baseline.nodes)
      setApiEdges(baseline.edges)
      setWorkflowPrompt(baseline.prompt)
    } else {
      const data = workflowByRuleQuery.data
      if (data?.nodes?.length) {
        setApiNodes(data.nodes)
        setApiEdges(data.edges ?? [])
      }
    }
    snapshotBaselineRef.current = null
    setSelectedSnapshotPipelineId(undefined)
    setCanvasEdited(false)
    setConfigDraftDirty(false)
  }

  function handleTogglePipelineSnapshot(item: PipelinePageItem) {
    if (!item.pipelineId) return

    if (selectedSnapshotPipelineId === item.pipelineId) {
      restoreWorkflowCanvasBaseline()
      return
    }

    if (!selectedSnapshotPipelineId) {
      snapshotBaselineRef.current = {
        nodes: apiNodes ?? [],
        edges: apiEdges ?? [],
        prompt: workflowPrompt,
      }
    }

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

  const promptInputDisabled = useMemo(() => {
    if (processingMode !== "edit") return true
    if (generationStep === "generating" || generationStep === "started") {
      return true
    }
    if (generateWorkflow.isPending || regenerateWorkflowByRule.isPending) {
      return true
    }
    return false
  }, [
    generateWorkflow.isPending,
    generationStep,
    processingMode,
    regenerateWorkflowByRule.isPending,
  ])

  const generationUiLocked = useMemo(() => {
    if (promptInputDisabled) return true
    if (selectedSnapshotPipelineId) return true
    if (canvasEdited || configDraftDirty) return true
    return false
  }, [
    canvasEdited,
    configDraftDirty,
    promptInputDisabled,
    selectedSnapshotPipelineId,
  ])

  const generationBlockedByDrafts =
    !promptInputDisabled &&
    (canvasEdited || configDraftDirty || Boolean(selectedSnapshotPipelineId))

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
        onWfNameCommit={handleWfNameCommit}
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
        onSave={processingMode === "edit" ? handleSave : undefined}
        isSaving={saveNodesMutation.isPending || saveByRuleMutation.isPending}
        readOnly={processingMode === "processing"}
        generationDisabled={generationUiLocked}
        showCancel={processingMode === "processing"}
        onCancel={handleCancelPipeline}
      />

      {processingMode === "processing" ? (
        <div className="border-b bg-card px-4 py-2">
          {pipelinePaused ? (
            <div className="mb-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Pipeline paused
              {pausedLaneId ? ` (channel: ${pausedLaneId})` : ""}
              {" "}
              — retry the failed node or use replan actions below.
              {pipelineId ? (
                <div className="mt-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 border-amber-400 bg-card text-[11px]"
                    disabled={replanMutation.isPending}
                    onClick={() => {
                      const nodes = runningPipelineQuery.data?.nodes ?? []
                      const afterId =
                        nodes.find(
                          (n) => n.status === "failed" || n.status === "pending",
                        )?.nodeId ?? nodes.at(-1)?.nodeId
                      if (!afterId) {
                        toast.error("No node to attach replan operation.")
                        return
                      }
                      void replanMutation
                        .mutateAsync({
                          pipelineId,
                          operations: [
                            {
                              op: "insert_node",
                              afterNodeId: afterId,
                              spec: { type: "translation", lane: pausedLaneId },
                            },
                          ],
                        })
                        .then(() => {
                          toast.success("Translation node inserted; resuming…")
                          setPipelinePaused(false)
                        })
                        .catch(() => toast.error("Replan failed."))
                    }}
                  >
                    Add translation (lane)
                  </Button>
                </div>
              ) : null}
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
        {canvasMode === "loading" ? (
          <WorkflowFlowSkeleton />
        ) : (
          <WorkflowFlowCanvas
            ref={canvasRef}
            workflowId={activeWorkflowId ?? undefined}
            apiNodes={pipelineCanvasOverride ? undefined : apiNodes}
            apiEdges={pipelineCanvasOverride ? undefined : apiEdges}
            rfNodesOverride={pipelineCanvasOverride?.nodes}
            rfEdgesOverride={pipelineCanvasOverride?.edges}
            branchChannels={branchChannels}
            resolvedChannels={branchChannels}
            channelCount={branchChannels.length}
            showEmptyPlaceholder={processingMode === "edit"}
            readOnly={processingMode === "processing"}
            runtimeById={nodeRuntimeById}
            onRetryNode={handleRetryNode}
            onSkipNode={handleSkipNode}
            onCanvasEdited={() => setCanvasEdited(true)}
            onConfigDraftChange={setConfigDraftDirty}
          />
        )}
        {processingMode === "edit" &&
        showWorkflowPrompt &&
        (canvasMode === "empty" || canvasMode === "ready") ? (
          <div className="absolute bottom-0 left-1/2 z-50 w-full max-w-[760px] -translate-x-1/2 px-4 pb-4">
            <div className="w-full rounded-2xl border border-border bg-card/95 p-2 shadow-lg backdrop-blur">
              <p className="px-2 pb-1 text-xs font-medium text-canvas-500">
                {canvasMode === "empty"
                  ? "Describe this workflow (structure)"
                  : "What do you want to post about?"}
              </p>
              <PromptArea
                value={workflowPrompt}
                onChange={setWorkflowPrompt}
                onSubmit={handleBottomPromptSubmit}
                disabled={promptInputDisabled}
                submitDisabled={generationUiLocked}
                placeholder={
                  canvasMode === "empty"
                    ? "e.g. Instagram + Facebook captions, Thai translation, hero image…"
                    : "e.g. Our Christmas sale — 50% off all items until Dec 25…"
                }
                className="shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
              />
              {generationBlockedByDrafts ? (
                <p className="px-2 pt-1 text-[11px] text-amber-700">
                  {selectedSnapshotPipelineId
                    ? "Clear or click the selected pipeline again to exit preview and generate."
                    : "Save workflow changes or apply node settings before generating. You can still edit this prompt."}
                </p>
              ) : null}
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
          <WorkflowUsedPipelinesPanel
            items={pipelineItems}
            total={pipelinePageQuery.data?.meta.total ?? 0}
            collapsed={pipelineListCollapsed}
            onCollapsedChange={setPipelineListCollapsed}
            selectedPipelineId={selectedSnapshotPipelineId}
            onToggleSelect={handleTogglePipelineSnapshot}
            onClearSelection={restoreWorkflowCanvasBaseline}
            isLoading={pipelinePageQuery.isLoading}
            hasMore={pipelinePage < pipelineTotalPages}
            isFetchingMore={pipelinePageQuery.isFetching}
            onLoadMore={() => setPipelinePage((p) => p + 1)}
          />
        ) : null}
      </div>

      {generationStep ? (
        <WorkflowGenerationProgress
          step={generationStep}
          failureMessage={failureMessage}
          onRetry={
            generationStep === "failed"
              ? () => {
                  if (
                    generateWorkflow.isPending ||
                    regenerateWorkflowByRule.isPending
                  ) {
                    return
                  }
                  setFailureMessage("")
                  handleWorkflowGenerateSubmit(workflowPrompt, [])
                }
              : undefined
          }
        />
      ) : null}

      <div className="pointer-events-none fixed right-6 bottom-6 z-30 flex flex-col gap-2">
        <button
          type="button"
          className="pointer-events-auto flex size-10 items-center justify-center rounded-full border bg-card shadow-sm"
          style={{ borderColor: T.surfaceBorder, color: T.textPrimary }}
          onClick={() => setContentDrawerOpen(true)}
          title="Workflow Contents"
        >
          <Library className="size-4" />
        </button>
        <button
          type="button"
          className="pointer-events-auto flex size-10 items-center justify-center rounded-full border bg-card shadow-sm"
          style={{ borderColor: T.surfaceBorder, color: T.textPrimary }}
          onClick={() => navigate("/")}
          title="Go to Home"
        >
          <Home className="size-4" />
        </button>
        <button
          type="button"
          className="pointer-events-auto flex size-10 items-center justify-center rounded-full border bg-card shadow-sm"
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
    case "adapt":
    case "intelligence":
    case "branch":
    case "merge":
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

