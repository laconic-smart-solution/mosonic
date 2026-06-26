import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom"
import {
  ChevronDown,
  ChevronUp,
  FileStack,
  Home,
  Library,
  Sparkles,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import i18n from "@/i18n"
import { PageShell } from "@/components/app/page-shell"
import { useSetBreadcrumbLabel } from "@/components/app/breadcrumb-override.context"
import { toastApiError } from "@/shared/lib/toast-error"
import { isInsufficientCredits } from "@/shared/lib/api-error"

import { Button } from "@/components/ui/button"
import { PromptArea, type Attachment } from "@/components/core/prompt-area"
import { GenerationCreditConfirmDialog } from "@/features/credit/components/generation-credit-confirm-dialog"
import { GenerationCreditHint } from "@/features/credit/components/generation-credit-hint"
import {
  WorkflowFlowCanvas,
  type WorkflowFlowCanvasHandle,
} from "@/features/workflow/components/workflow-flow-canvas"
import { WorkflowFlowSkeleton } from "@/features/workflow/components/workflow-flow-skeleton"
import { WorkflowGenerationProgress } from "@/features/workflow/components/workflow-generation-progress"
import { WorkflowContentDrawer } from "@/features/workflow/components/workflow-content-drawer"
import { WorkflowToolbar } from "@/features/workflow/components/workflow-toolbar"
import { PipelineStopConfirmDialog } from "@/features/pipeline/components/pipeline-stop-confirm-dialog"
import { WorkflowUsedPipelinesPanel } from "@/features/workflow/components/workflow-used-pipelines-panel"
import { WorkflowQaWizard } from "@/features/workflow/components/workflow-qa-wizard/workflow-qa-wizard"
import { WorkflowRunConfirmDialog } from "@/features/workflow/components/workflow-run-confirm-dialog"
import { workflowHasIntelligenceNode } from "@/features/workflow/lib/workflow-freshness.util"
import type { WorkflowQAAnswers } from "@/features/workflow/types/workflow-qa.type"
import { rfNodesToApiPayload } from "@/features/workflow/data/workflow-model"
import type { RuleEntity } from "@/features/rules/data/rules-mock"
import {
  resolveBranchChannels,
  RULE_CHANNELS_BRANCH_CONFIG,
} from "@/features/workflow/lib/branch-channels"
import type { WfRfNode } from "@/features/workflow/data/workflow-model"
import { pipelineGraphToRf } from "@/features/workflow/lib/branch-layout"
import {
  mapPipelineRuntimeToCanvas,
  mergePipelineRuntimeMaps,
  resolveCanvasNodeIdToPipeline,
} from "@/features/workflow/lib/pipeline-runtime-map"
import {
  getBranchSubgraphLaneErrors,
  stripDisconnectedWorkflowNodes,
  getVideoPresenterErrorsFromRfNodes,
} from "@/features/workflow/lib/workflow-node-validation"
import { navigateAfterPipelineSuccess } from "@/features/workflow/lib/pipeline-completion-nav"
import { useGenerationCreditCostsQuery } from "@/shared/queries/credit.query"
import { useRuleByIdQuery } from "@/shared/queries/rule.query"
import { useContentPageQuery } from "@/shared/queries/content.query"
import {
  useGenerateWorkflow,
  useGetWorkflowByRuleIdQuery,
  useRegenerateWorkflowByRuleMutation,
  usePatchWorkflowMutation,
  useSaveWorkflowNodesByRuleMutation,
  useSaveWorkflowNodesMutation,
  useApplyPipelineToWorkflowMutation,
} from "@/shared/queries/workflow.query"
import {
  useGetPipelineQuery,
  usePipelinePageQuery,
  useRetryNodeMutation,
  useReplanPipelineMutation,
  useSkipNodeMutation,
  useStartPipelineMutation,
  useUpdatePipelineNameMutation,
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
  onPipelineLanePaused,
  onPipelineStarted,
} from "@/shared/socket/pipeline-events"
import { getSharedSocket } from "@/shared/socket/socket-client"
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
import type { PipelinePageItem, GetPipelineResponse } from "@/shared/types/pipeline.type"
import { T } from "@/lib/tokens"

type GenerationStep = "started" | "generating" | "failed"
type RouteState = {
  generating?: boolean
  ruleName?: string
  /** Carried from home so the pipeline bar is pre-filled */
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
  const { t } = useTranslation("workflow")
  const generationCostsQuery = useGenerationCreditCostsQuery()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const { ruleId } = useParams<{ ruleId: string }>()
  const routeState = (location.state ?? {}) as RouteState

  const untitledWfName = () => t("toolbar.untitledWorkflow")

  const initialNavContentPrompt =
    typeof routeState.contentPrompt === "string"
      ? routeState.contentPrompt.trim()
      : ""

  const [wfName, setWfName] = useState(() => i18n.t("workflow:toolbar.untitledWorkflow"))
  const [ruleName, setRuleName] = useState<string | undefined>(
    routeState.ruleName
  )
  const [activeWorkflowId, setActiveWorkflowId] = useState<string | undefined>(
    undefined
  )
  const [workflowPrompt, setWorkflowPrompt] = useState(initialNavContentPrompt)
  const [stopPipelineDialogOpen, setStopPipelineDialogOpen] = useState(false)
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
  const [pipelineListCollapsed, setPipelineListCollapsed] = useState(true)
  const [promptBarCollapsed, setPromptBarCollapsed] = useState(false)
  const [selectedSnapshotPipelineId, setSelectedSnapshotPipelineId] =
    useState<string>()
  const pipelinePromptHydratedRef = useRef(false)
  const snapshotBaselineRef = useRef<SnapshotBaseline | null>(null)
  const completedNodeIdsRef = useRef<Set<string>>(new Set())
  const totalNodesRef = useRef<number | null>(null)
  const pipelineCompletionHandledRef = useRef(false)
  const stuckFinalizeAttemptedRef = useRef(false)
  const [canvasEdited, setCanvasEdited] = useState(false)
  const [configDraftDirty, setConfigDraftDirty] = useState(false)

  const [generationStep, setGenerationStep] = useState<GenerationStep | null>(
    routeState.generating ? "started" : null
  )

  const canvasRef = useRef<WorkflowFlowCanvasHandle>(null)
  const [canvasShellEl, setCanvasShellEl] = useState<HTMLDivElement | null>(
    null,
  )
  /** True after submit until completed/failed or nodes arrive (matches rule page processingRuleId pattern). */
  const generationInFlightRef = useRef(false)
  /** True after pipeline start submit until id is known from HTTP or first socket event. */
  const pipelineInFlightRef = useRef(false)
  /** When set, start pipeline with this prompt after workflow generation completes. */
  const pendingPipelineAfterWorkflowRef = useRef<string | null>(null)
  const runPipelineAfterQaRef = useRef(false)
  const lastQaAnswersRef = useRef<WorkflowQAAnswers | null>(null)
  const [qaWizardOpen, setQaWizardOpen] = useState(false)
  const [qaInitialMessage, setQaInitialMessage] = useState("")
  const [runConfirmOpen, setRunConfirmOpen] = useState(false)
  const [workflowGenConfirmOpen, setWorkflowGenConfirmOpen] = useState(false)
  const pendingWorkflowAnswersRef = useRef<WorkflowQAAnswers | null>(null)
  const [pendingRunPrompt, setPendingRunPrompt] = useState<string | null>(null)
  /** Id used to filter socket events; updated synchronously on adopt so rapid events are not dropped before React re-renders. */
  const workflowEventTargetRef = useRef<string | undefined>(undefined)
  const committedWfNameRef = useRef(i18n.t("workflow:toolbar.untitledWorkflow"))
  useEffect(() => {
    workflowEventTargetRef.current = activeWorkflowId
  }, [activeWorkflowId])

  /** Id used to filter pipeline socket events (avoids stale closure on handler re-subscribe). */
  const pipelineIdRef = useRef<string | undefined>(pipelineId)
  useEffect(() => {
    pipelineIdRef.current = pipelineId
  }, [pipelineId])

  const generateWorkflow = useGenerateWorkflow()
  const regenerateWorkflowByRule = useRegenerateWorkflowByRuleMutation()
  const saveNodesMutation = useSaveWorkflowNodesMutation()
  const saveByRuleMutation = useSaveWorkflowNodesByRuleMutation()
  const patchWorkflowMutation = usePatchWorkflowMutation()
  const startPipelineMutation = useStartPipelineMutation()
  const retryNodeMutation = useRetryNodeMutation()
  const skipNodeMutation = useSkipNodeMutation()
  const replanMutation = useReplanPipelineMutation()
  const applyPipelineToWorkflow = useApplyPipelineToWorkflowMutation()
  const updatePipelineNameMutation = useUpdatePipelineNameMutation()
  const runningPipelineQuery = useGetPipelineQuery(pipelineId, {
    refetchInterval: (query) => {
      if (!pipelineId) return false
      if (processingMode === "processing") return 3000
      const status = query.state.data?.pipeline?.status
      if (status === "running" || status === "paused") return 3000
      return false
    },
    refetchIntervalInBackground: false,
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
      void queryClient.invalidateQueries({ queryKey: ["usage", "summary"] })
      void queryClient.invalidateQueries({ queryKey: ["usage", "history"] })
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
    [navigate, queryClient, setSearchParams],
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

  const ruleChannelIds = useMemo(
    () => branchChannels.map((c) => c.id),
    [branchChannels],
  )

  const activePipelineSnap = useMemo(() => {
    if (processingMode === "processing" || pipelineId) {
      return runningPipelineQuery.data
    }
    if (selectedSnapshotPipelineId) return selectedPipelineSnapshotQuery.data
    return undefined
  }, [
    pipelineId,
    processingMode,
    runningPipelineQuery.data,
    selectedSnapshotPipelineId,
    selectedPipelineSnapshotQuery.data,
  ])

  /** Materialized graph when previewing a pipeline, while running, or template is missing. */
  const pipelineCanvasOverride = useMemo(() => {
    if (!activePipelineSnap?.nodes.length) return null
    const isPreview = Boolean(selectedSnapshotPipelineId)
    const isRunning =
      processingMode === "processing" ||
      activePipelineSnap.pipeline.status === "running" ||
      activePipelineSnap.pipeline.status === "paused"
    const useMaterialized =
      !apiNodes?.length || isPreview || isRunning || Boolean(pipelineId)
    if (!useMaterialized) return null
    return pipelineGraphToRf({
      nodes: activePipelineSnap.nodes,
      edges: activePipelineSnap.graph?.edges ?? [],
      lanes: activePipelineSnap.graph?.lanes ?? [],
      layout: activePipelineSnap.graph?.layout,
      channelHandles: branchChannels,
    })
  }, [
    activePipelineSnap,
    apiNodes,
    branchChannels,
    pipelineId,
    processingMode,
    selectedSnapshotPipelineId,
  ])

  const displayRuntimeById = useMemo(() => {
    if (selectedSnapshotPipelineId) return {}
    // Materialized pipeline canvas uses pipeline node ids; template canvas uses workflow node ids.
    if (pipelineCanvasOverride) return nodeRuntimeById
    return mapPipelineRuntimeToCanvas(nodeRuntimeById)
  }, [nodeRuntimeById, pipelineCanvasOverride, selectedSnapshotPipelineId])

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
      setWfName(untitledWfName())
      committedWfNameRef.current = untitledWfName()
      return
    }

    const wf = data.workflow
    if (!wf?.workflowId) {
      setActiveWorkflowId(undefined)
      setApiNodes([])
      setWfName(untitledWfName())
      committedWfNameRef.current = untitledWfName()
      return
    }

    setActiveWorkflowId(wf.workflowId)
    const loadedName = wf.name?.trim() || untitledWfName()
    setWfName(loadedName)
    committedWfNameRef.current = loadedName

    if (wf.status === "failed") {
      generationInFlightRef.current = false
      setGenerationStep("failed")
      setFailureMessage(t("errors.generateWorkflowFailed"))
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
      const pendingPrompt = pendingPipelineAfterWorkflowRef.current
      if (pendingPrompt && wf.workflowId) {
        pendingPipelineAfterWorkflowRef.current = null
        queueMicrotask(() => {
          runStartPipelineMutation(pendingPrompt, wf.workflowId)
        })
      }
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
    totalNodesRef.current = totalNodes
  }, [totalNodes])

  const maybeTryFinalizePipeline = useCallback(
    (pid: string) => {
      if (stuckFinalizeAttemptedRef.current) return
      const total = totalNodesRef.current
      const completed = completedNodeIdsRef.current.size
      if (!total || completed < total) return
      stuckFinalizeAttemptedRef.current = true
      void pipelineService
        .tryFinalize(pid)
        .then(() => runningPipelineQuery.refetch())
        .catch(() => {
          stuckFinalizeAttemptedRef.current = false
        })
    },
    [runningPipelineQuery.refetch],
  )

  const buildRuntimeFromPipelineNodes = useCallback(
    (snap: GetPipelineResponse) => {
      const runtime: Record<string, Record<string, unknown>> = {}
      const completed = new Set<string>()
      for (const node of snap.nodes) {
        const normalizedStatus =
          node.status === "failed"
            ? "failed_final"
            : node.status === "completed" || node.status === "skipped"
              ? "completed"
              : node.status
        const merged = outputToRuntime(node.type, node.output)
        runtime[node.nodeId] = {
          status: normalizedStatus,
          ...(node.lane ? { lane: node.lane } : {}),
          ...merged,
        }
        if (node.status === "completed" || node.status === "skipped") {
          completed.add(node.nodeId)
        }
      }
      return { runtime, completed }
    },
    [],
  )

  /** Used Pipelines panel: structure preview only (no generated output overlay). */
  const hydratePipelineSnapshotForPreview = useCallback(
    (_snap: GetPipelineResponse) => {
      setNodeRuntimeById({})
      setTotalNodes(null)
      setCompletedNodes(0)
      completedNodeIdsRef.current.clear()
      setPipelinePaused(false)
      setPausedLaneId(null)
      setPipelineFailedMessage("")
    },
    [],
  )

  const hydratePipelineSnapshot = useCallback(
    (snap: GetPipelineResponse) => {
      const { runtime, completed } = buildRuntimeFromPipelineNodes(snap)
      for (const nodeId of completed) {
        completedNodeIdsRef.current.add(nodeId)
      }
      setNodeRuntimeById((prev) => mergePipelineRuntimeMaps(prev, runtime))
      setTotalNodes(snap.nodes.length)
      setCompletedNodes(completedNodeIdsRef.current.size)

      if (snap.pipeline.status === "paused") {
        setPipelinePaused(true)
        setPausedLaneId(snap.pipeline.pausedLaneId ?? null)
        setProcessingMode("processing")
      } else if (snap.pipeline.status === "running") {
        setPipelinePaused(false)
        setPausedLaneId(null)
        setProcessingMode("processing")
        if (completedNodeIdsRef.current.size >= snap.nodes.length && snap.nodes.length > 0) {
          maybeTryFinalizePipeline(snap.pipeline.pipelineId)
        }
      } else if (snap.pipeline.status === "failed") {
        setPipelineFailedMessage(t("errors.somethingWrong"))
        setProcessingMode("failed")
      } else if (snap.pipeline.status === "completed") {
        void handlePipelineCompletion({
          pipelineId: snap.pipeline.pipelineId,
          contentId: snap.pipeline.contentId,
          uploadId: snap.pipeline.uploadId,
        })
      }
    },
    [
      buildRuntimeFromPipelineNodes,
      handlePipelineCompletion,
      maybeTryFinalizePipeline,
    ],
  )

  useEffect(() => {
    if (!runningPipelineQuery.data || !pipelineId) return
    if (runningPipelineQuery.data.pipeline.pipelineId !== pipelineId) return
    hydratePipelineSnapshot(runningPipelineQuery.data)
  }, [hydratePipelineSnapshot, pipelineId, runningPipelineQuery.data])

  useEffect(() => {
    if (!selectedSnapshotPipelineId) return
    const snap = selectedPipelineSnapshotQuery.data
    if (!snap || snap.pipeline.pipelineId !== selectedSnapshotPipelineId) return
    setWorkflowPrompt(snap.pipeline.contentPrompt ?? "")
    hydratePipelineSnapshotForPreview(snap)
  }, [
    hydratePipelineSnapshotForPreview,
    selectedSnapshotPipelineId,
    selectedPipelineSnapshotQuery.data,
  ])

  // Stay in the workflow socket room while this workflow id is active (incl. after complete) so regeneration events are received.
  useEffect(() => {
    if (!activeWorkflowId) return
    joinWorkflowRoom(activeWorkflowId)
    return () => leaveWorkflowRoom(activeWorkflowId)
  }, [activeWorkflowId])

  useEffect(() => {
    if (!pipelineId) return
    joinPipelineRoom(pipelineId)
    void runningPipelineQuery.refetch()
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
        const pendingPrompt = pendingPipelineAfterWorkflowRef.current
        if (pendingPrompt) {
          pendingPipelineAfterWorkflowRef.current = null
          queueMicrotask(() => runStartPipelineMutation(pendingPrompt, id))
        }
      }),
      onWorkflowFailed(({ workflowId: id, message }) => {
        if (!allowsWorkflowSocket(id)) return
        generationInFlightRef.current = false
        pendingPipelineAfterWorkflowRef.current = null
        setFailureMessage(
          message ?? t("errors.generateWorkflowFailed")
        )
        setGenerationStep("failed")
      }),
    ]

    return () => cleanups.forEach((fn) => fn())
  }, [])

  const maybeTryFinalizePipelineRef = useRef(maybeTryFinalizePipeline)
  maybeTryFinalizePipelineRef.current = maybeTryFinalizePipeline

  const handlePipelineCompletionRef = useRef(handlePipelineCompletion)
  handlePipelineCompletionRef.current = handlePipelineCompletion

  const resetPipelineProcessingStateRef = useRef<() => void>(() => {})

  // Subscribe once; adopt pipeline id from first event when HTTP has not returned yet.
  useEffect(() => {
    getSharedSocket()

    function adoptPipelineFromSocket(id: string): void {
      pipelineInFlightRef.current = false
      pipelineCompletionHandledRef.current = false
      stuckFinalizeAttemptedRef.current = false
      pipelineIdRef.current = id
      joinPipelineRoom(id)
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
    }

    function allowsPipelineSocket(id: string): boolean {
      const known = pipelineIdRef.current
      if (known !== undefined) return id === known
      if (!pipelineInFlightRef.current) return false
      adoptPipelineFromSocket(id)
      return true
    }

    const cleanups = [
      onPipelineStarted(({ pipelineId: id, totalNodes: total }) => {
        if (!allowsPipelineSocket(id)) return
        setTotalNodes(total)
        setCompletedNodes(completedNodeIdsRef.current.size)
      }),
      onNodeStarted(({ pipelineId: id, nodeId }) => {
        if (!allowsPipelineSocket(id)) return
        setNodeRuntimeById((prev) => ({
          ...prev,
          [nodeId]: {
            ...(prev[nodeId] ?? {}),
            status: "running",
            processingMessage: i18n.t("workflow:processing.generating"),
            errorMessage: undefined,
          },
        }))
      }),
      onNodeStreaming(({ pipelineId: id, nodeId, chunk }) => {
        if (!allowsPipelineSocket(id)) return
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
        if (!allowsPipelineSocket(id)) return
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
        if (!allowsPipelineSocket(id)) return
        setNodeRuntimeById((prev) => ({
          ...prev,
          [nodeId]: {
            ...(prev[nodeId] ?? {}),
            status: "retrying",
            retryAttempt: attempt,
            retryMaxAttempts: maxAttempts,
            processingMessage: i18n.t("workflow:processing.retrying", {
              attempt,
              max: maxAttempts,
            }),
          },
        }))
      }),
      onNodeCompleted(({ pipelineId: id, nodeId, nodeType, output }) => {
        if (!allowsPipelineSocket(id)) return
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
        maybeTryFinalizePipelineRef.current(id)
      }),
      onNodeFailedFinal(({ pipelineId: id, nodeId, message }) => {
        if (!allowsPipelineSocket(id)) return
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
      onPipelinePaused(({ pipelineId: id, pausedLaneId: laneId }) => {
        if (!allowsPipelineSocket(id)) return
        setPipelinePaused(true)
        setPausedLaneId(laneId ?? null)
      }),
      onPipelineLanePaused(({ pipelineId: id, pausedLaneId: laneId }) => {
        if (!allowsPipelineSocket(id)) return
        setPipelinePaused(true)
        setPausedLaneId(laneId ?? null)
      }),
      onPipelineCompleted(({ pipelineId: id, contentId, uploadId }) => {
        if (!allowsPipelineSocket(id)) return
        pipelineInFlightRef.current = false
        void handlePipelineCompletionRef.current({
          pipelineId: id,
          contentId,
          uploadId,
        })
      }),
      onPipelineFailed(({ pipelineId: id, message, reason }) => {
        if (!allowsPipelineSocket(id)) return
        pipelineInFlightRef.current = false
        setPipelinePaused(false)
        if (reason === "cancelled") {
          resetPipelineProcessingStateRef.current()
          return
        }
        setPipelineFailedMessage(
          message ?? i18n.t("workflow:errors.somethingWrong"),
        )
        setProcessingMode("failed")
      }),
    ]
    return () => cleanups.forEach((fn) => fn())
  }, [])

  function handleWfNameCommit() {
    if (!activeWorkflowId || !ruleId) return
    const trimmed = wfName.trim() || untitledWfName()
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
    if (configDraftDirty) {
      const applied = canvasRef.current?.applyOpenPropertiesPanel()
      if (applied === false) return
    }
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
      toast.info(t("toasts.replacedAdaptNodes"))
    }
    if (branchChannels.length > 0 && branchChannels.length < 2) {
      toast.error(t("toasts.branchNeedsChannels"))
      return
    }
    if (laneErrors.length > 0) {
      toast.error(laneErrors[0])
      return
    }
    const strippedDisconnected = stripDisconnectedWorkflowNodes(
      nodesToSave,
      edgesToSave,
    )
    if (strippedDisconnected.removedLabels.length > 0) {
      nodesToSave = strippedDisconnected.nodes
      canvasRef.current?.removeNodesByIds(strippedDisconnected.removedIds)
      const count = strippedDisconnected.removedLabels.length
      toast.info(
        count === 1
          ? t("toasts.removedDisconnectedNode", {
              label: strippedDisconnected.removedLabels[0],
            })
          : t("toasts.removedDisconnectedNodes", { count }),
      )
    }
    nodesToSave = normalizeBranchNodesForSave(nodesToSave)
    const payload = rfNodesToApiPayload(nodesToSave, edgesToSave)
    if (payload.nodes.length === 0) {
      toast.error(t("toasts.addNodeBeforeSave"))
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

  function runStartPipelineMutation(
    contentPrompt: string,
    workflowIdOverride?: string,
  ) {
    const workflowId = workflowIdOverride ?? activeWorkflowId
    if (!workflowId || !ruleId) return
    const useLearnings = searchParams.get("useLearnings") === "1"
    pipelineInFlightRef.current = true
    startPipelineMutation.mutate(
      { workflowId, ruleId, contentPrompt, useLearnings },
      {
        onSuccess: ({ pipelineId: id }) => {
          pipelineInFlightRef.current = false
          pipelineCompletionHandledRef.current = false
          stuckFinalizeAttemptedRef.current = false
          setRunConfirmOpen(false)
          setPendingRunPrompt(null)
          void queryClient.invalidateQueries({ queryKey: ["usage", "summary"] })
          void queryClient.invalidateQueries({
            queryKey: ["pipeline", "estimate"],
          })
          pipelineIdRef.current = id
          joinPipelineRoom(id)
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
          void pipelineService.getById(id).then((snap) => {
            if (pipelineIdRef.current !== id) return
            hydratePipelineSnapshot(snap)
          })
        },
        onError: (err) => {
          pipelineInFlightRef.current = false
          if (isInsufficientCredits(err)) {
            toastApiError(err, "credit:runConfirm.insufficientTitle")
            return
          }
          toastApiError(err, "workflow:toasts.pipelineStartFailed")
        },
      },
    )
  }

  function handleStartPipeline(contentPromptOverride?: string) {
    if (!activeWorkflowId || !ruleId) return
    const contentPrompt = (contentPromptOverride ?? workflowPrompt).trim()
    if (!contentPrompt) {
      toast.error(t("toasts.enterPostTopic"))
      return
    }

    const hadDraftChanges = configDraftDirty
    const hadCanvasEdits = canvasEdited

    if (configDraftDirty) {
      const applied = canvasRef.current?.applyOpenPropertiesPanel()
      if (applied === false) return
    }

    const rfNodes = canvasRef.current?.getRfNodes() ?? []
    const presenterErrors = getVideoPresenterErrorsFromRfNodes(rfNodes)
    if (presenterErrors.length > 0) {
      toast.error(presenterErrors[0])
      return
    }

    const startAfterSave = () => {
      setPendingRunPrompt(contentPrompt)
      setRunConfirmOpen(true)
    }

    if (!hadCanvasEdits && !hadDraftChanges) {
      startAfterSave()
      return
    }

    const rfEdges = canvasRef.current?.getRfEdges() ?? []
    let nodesToSave = rfNodes
    let edgesToSave = rfEdges
    const strippedDisconnected = stripDisconnectedWorkflowNodes(
      nodesToSave,
      edgesToSave,
    )
    if (strippedDisconnected.removedLabels.length > 0) {
      nodesToSave = strippedDisconnected.nodes
      canvasRef.current?.removeNodesByIds(strippedDisconnected.removedIds)
    }
    nodesToSave = normalizeBranchNodesForSave(nodesToSave)
    const payload = rfNodesToApiPayload(nodesToSave, edgesToSave)
    if (payload.nodes.length === 0) {
      toast.error(t("toasts.addNodeBeforeRun"))
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
          toast.error(t("toasts.saveBeforeRunPresenter"))
        },
      },
    )
  }

  function handleOpenQaWizard(initialMessage = "", runAfter = false) {
    if (!ruleId) return
    setQaInitialMessage(initialMessage)
    runPipelineAfterQaRef.current = runAfter
    setQaWizardOpen(true)
  }

  function requestWorkflowGeneration(answers: WorkflowQAAnswers) {
    pendingWorkflowAnswersRef.current = answers
    setQaWizardOpen(false)
    setWorkflowGenConfirmOpen(true)
  }

  function executeWorkflowGeneration(answers: WorkflowQAAnswers) {
    if (!ruleId) return
    lastQaAnswersRef.current = answers
    const additionalMessage = answers.additionalMessage.trim()
    setWorkflowPrompt(answers.additionalMessage)
    if (runPipelineAfterQaRef.current) {
      pendingPipelineAfterWorkflowRef.current = additionalMessage || null
    }
    runPipelineAfterQaRef.current = false

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
          contentPrompt: additionalMessage,
        },
      })
      void workflowByRuleQuery.refetch()
    }

    const onError = (err: unknown) => {
      generationInFlightRef.current = false
      setGenerationStep(null)
      if (isInsufficientCredits(err)) {
        toastApiError(err, "credit:runConfirm.insufficientTitle")
        return
      }
      toastApiError(err, "workflow:errors.generateWorkflowFailed")
    }

    if (activeWorkflowId) {
      regenerateWorkflowByRule.mutate({ answers, ruleId }, { onSuccess, onError })
      return
    }

    generateWorkflow.mutate({ ruleId, answers }, { onSuccess, onError })
  }

  function submitWorkflowGeneration(answers: WorkflowQAAnswers) {
    requestWorkflowGeneration(answers)
  }

  function handlePrimaryAction(text: string, _attachments: Attachment[]) {
    if (generationUiLocked) return
    handleStartPipeline(text.trim())
  }

  function resetPipelineProcessingState() {
    pipelineInFlightRef.current = false
    pipelineCompletionHandledRef.current = false
    if (pipelineId) leavePipelineRoom(pipelineId)
    pipelineIdRef.current = undefined
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
  resetPipelineProcessingStateRef.current = resetPipelineProcessingState

  function handleRequestStopPipeline() {
    if (!pipelineId) return
    setStopPipelineDialogOpen(true)
  }

  function resolvePipelineNodeIdForCanvas(canvasNodeId: string): string {
    const snap = runningPipelineQuery.data
    if (!snap?.nodes.length) return canvasNodeId
    const templateNode = apiNodes?.find((n) => n.nodeId === canvasNodeId)
    const lane =
      templateNode?.lane ??
      (typeof templateNode?.config?.laneId === "string"
        ? templateNode.config.laneId
        : null)
    return resolveCanvasNodeIdToPipeline(canvasNodeId, snap.nodes, lane)
  }

  function handleRetryNode(nodeId: string) {
    if (!pipelineId) return
    const pipelineNodeId = resolvePipelineNodeIdForCanvas(nodeId)
    retryNodeMutation.mutate(
      { pipelineId, payload: { nodeId: pipelineNodeId } },
      {
        onSuccess: () => {
          setPipelinePaused(false)
          setNodeRuntimeById((prev) => ({
            ...prev,
            [nodeId]: {
              ...(prev[nodeId] ?? {}),
              status: "running",
              errorMessage: undefined,
              processingMessage: t("processing.generating"),
            },
          }))
        },
        onError: (err) => {
          toastApiError(err, "workflow:toasts.retryFailed")
        },
      }
    )
  }

  function handleSkipNode(nodeId: string) {
    if (!pipelineId) return
    const pipelineNodeId = resolvePipelineNodeIdForCanvas(nodeId)
    skipNodeMutation.mutate(
      { pipelineId, payload: { nodeId: pipelineNodeId } },
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
        onError: (err) => {
          toastApiError(err, "workflow:toasts.skipFailed")
        },
      }
    )
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
    setNodeRuntimeById({})
    setTotalNodes(null)
    setCompletedNodes(0)
    completedNodeIdsRef.current.clear()
    setPipelinePaused(false)
    setPausedLaneId(null)
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
    setProcessingMode("edit")
    setPipelineFailedMessage("")
    setNodeRuntimeById({})
    void selectedPipelineSnapshotQuery.refetch()
  }

  function handleApplyPipelineToWorkflow(item: PipelinePageItem) {
    if (!ruleId || !item.pipelineId) return
    applyPipelineToWorkflow.mutate(
      { ruleId, pipelineId: item.pipelineId },
      {
        onSuccess: (data) => {
          setApiNodes(data.nodes as WorkflowNode[])
          setApiEdges(data.edges)
          setWorkflowPrompt(data.contentPrompt ?? "")
          snapshotBaselineRef.current = null
          setSelectedSnapshotPipelineId(undefined)
          setNodeRuntimeById({})
          setCanvasEdited(true)
          setConfigDraftDirty(false)
          toast.success(t("usedPipelines.applySuccess"))
        },
        onError: (err) => {
          toastApiError(err, "workflow:usedPipelines.applyFailed")
        },
      },
    )
  }

  function handleRenamePipeline(pipelineId: string, name: string) {
    updatePipelineNameMutation.mutate({ pipelineId, name })
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

  /** Wait for materialized pipeline graph before showing template nodes during a run. */
  const pipelineCanvasLoading = useMemo(() => {
    if (!pipelineId && processingMode !== "processing") return false
    if (activePipelineSnap?.nodes.length) return false
    return runningPipelineQuery.isLoading || runningPipelineQuery.isFetching
  }, [
    activePipelineSnap?.nodes.length,
    pipelineId,
    processingMode,
    runningPipelineQuery.isFetching,
    runningPipelineQuery.isLoading,
  ])

  const showCanvasSkeleton =
    canvasMode === "loading" || pipelineCanvasLoading

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
    if (canvasMode === "empty") return true
    if (canvasEdited || configDraftDirty) return true
    return false
  }, [
    canvasEdited,
    canvasMode,
    configDraftDirty,
    promptInputDisabled,
    selectedSnapshotPipelineId,
  ])

  const generateWorkflowDisabled = promptInputDisabled

  const generationBlockedByDrafts =
    !promptInputDisabled &&
    canvasMode === "ready" &&
    (canvasEdited || configDraftDirty || Boolean(selectedSnapshotPipelineId))

  useSetBreadcrumbLabel(wfName.trim() || ruleName || undefined)

  if (!ruleId) {
    return (
      <PageShell variant="canvas">
        <div
          className="flex min-h-0 flex-1 flex-col items-center justify-center"
          style={{ background: T.canvasBg }}
        >
        <p className="text-sm" style={{ color: T.textSecondary }}>
          {t("errors.invalidUrl")}
        </p>
        <button
          type="button"
          className="mt-4 text-sm font-medium underline"
          style={{ color: T.accent }}
          onClick={() => navigate("/rules")}
        >
          {t("fab.goToRules")}
        </button>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell variant="canvas">
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
        onRun={() => handlePrimaryAction(workflowPrompt, [])}
        onGenerateWorkflow={() => handleOpenQaWizard("", false)}
        runLabel={t("toolbar.generateContent")}
        onSave={processingMode === "edit" ? handleSave : undefined}
        isSaving={saveNodesMutation.isPending || saveByRuleMutation.isPending}
        readOnly={processingMode === "processing"}
        generationDisabled={generationUiLocked}
        generateWorkflowDisabled={generateWorkflowDisabled}
        workflowGenerationCredits={
          generationCostsQuery.data?.workflowGeneration
        }
        showCancel={processingMode === "processing"}
        onCancel={handleRequestStopPipeline}
      />

      {processingMode === "processing" ? (
        <div className="border-b bg-card px-4 py-2 space-y-2">
          <p className="text-[10px] text-muted-foreground">
            {t("processing.systemMessagesEnglishHint")}
          </p>
          {pipelinePaused ? (
            <div className="mb-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              {pausedLaneId
                ? t("processing.pipelinePausedChannel", { channel: pausedLaneId })
                : t("processing.pipelinePaused")}
              {t("processing.pipelinePausedHint")}
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
                        toast.error(t("toasts.noReplanNode"))
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
                          toast.success(t("toasts.translationInserted"))
                          setPipelinePaused(false)
                          void runningPipelineQuery.refetch()
                        })
                        .catch((err) => toastApiError(err, "workflow:toasts.replanFailed"))
                    }}
                  >
                    {t("processing.addTranslationLane")}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="mb-1 flex items-center justify-between text-xs text-gray-600">
            <span>
              {progressPercent == null
                ? t("processing.running")
                : t("processing.nodesCompleted", {
                    completed: completedNodes,
                    total: totalNodes ?? 0,
                  })}
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
            {pipelineFailedMessage || t("errors.somethingWrong")}
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
            {t("processing.startOver")}
          </button>
        </div>
      ) : null}

      <div
        ref={setCanvasShellEl}
        className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden"
      >
        {showCanvasSkeleton ? (
          <WorkflowFlowSkeleton />
        ) : (
          <WorkflowFlowCanvas
            ref={canvasRef}
            overlayRoot={canvasShellEl}
            workflowId={activeWorkflowId ?? undefined}
            apiNodes={pipelineCanvasOverride ? undefined : apiNodes}
            apiEdges={pipelineCanvasOverride ? undefined : apiEdges}
            rfNodesOverride={pipelineCanvasOverride?.nodes}
            rfEdgesOverride={pipelineCanvasOverride?.edges}
            branchChannels={branchChannels}
            resolvedChannels={branchChannels}
            channelCount={branchChannels.length}
            showEmptyPlaceholder={processingMode === "edit"}
            readOnly={
              processingMode === "processing" ||
              Boolean(selectedSnapshotPipelineId)
            }
            runtimeById={displayRuntimeById}
            onRetryNode={handleRetryNode}
            onSkipNode={handleSkipNode}
            onCanvasEdited={() => setCanvasEdited(true)}
            onConfigDraftChange={setConfigDraftDirty}
          />
        )}
        {processingMode === "edit" &&
        (canvasMode === "empty" || canvasMode === "ready") ? (
          <div className="absolute bottom-0 left-1/2 z-40 w-full max-w-[760px] -translate-x-1/2 px-4 pb-4">
            <div className="relative w-full space-y-2 rounded-2xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur">
              {promptBarCollapsed ? (
                <button
                  type="button"
                  onClick={() => setPromptBarCollapsed(false)}
                  className="flex w-full min-w-0 items-center gap-2 py-0.5 text-left"
                  aria-expanded={false}
                  aria-label={t("promptBar.showPrompt")}
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                    {canvasMode === "ready" && workflowPrompt.trim()
                      ? workflowPrompt.trim()
                      : t("promptBar.postTopic")}
                  </span>
                  <ChevronUp className="size-4 shrink-0 text-muted-foreground" />
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setPromptBarCollapsed(true)}
                    className="absolute top-2 right-2 z-10 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-expanded
                    aria-label={t("promptBar.hidePrompt")}
                  >
                    <ChevronDown className="size-4" />
                  </button>
                  {canvasMode === "empty" ? (
                    <div className="flex flex-col items-center gap-3 py-3">
                      <p className="text-center text-sm text-muted-foreground">
                        {t("promptBar.emptyWorkflowHint")}
                      </p>
                      <Button
                        type="button"
                        onClick={() => handleOpenQaWizard("", false)}
                        disabled={generateWorkflowDisabled}
                        className="gap-2"
                      >
                        <Sparkles className="size-4" aria-hidden />
                        {t("toolbar.generateWorkflow")}
                      </Button>
                      <GenerationCreditHint
                        credits={generationCostsQuery.data?.workflowGeneration}
                      />
                    </div>
                  ) : (
                    <>
                      <PromptArea
                        value={workflowPrompt}
                        onChange={setWorkflowPrompt}
                        onSubmit={handlePrimaryAction}
                        disabled={promptInputDisabled}
                        submitDisabled={generationUiLocked}
                        placeholder={t("promptBar.postPlaceholder")}
                        className="shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
                      />
                      {generationBlockedByDrafts ? (
                        <p className="px-1 pt-0.5 text-[11px] text-amber-700">
                          {selectedSnapshotPipelineId
                            ? t("promptBar.exitPreviewHint")
                            : t("promptBar.saveBeforeGenerateHint")}
                        </p>
                      ) : null}
                      <p className="px-1 pt-0.5 text-[11px] text-canvas-500">
                        {t("promptBar.usingWorkflow", {
                          name: wfName,
                          count: apiNodes?.length ?? 0,
                          nodesLabel: t("nodesLabel", {
                            count: apiNodes?.length ?? 0,
                          }),
                        })}
                      </p>
                    </>
                  )}
                </>
              )}
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
            onApplyToWorkflow={handleApplyPipelineToWorkflow}
            onRenamePipeline={handleRenamePipeline}
            isApplying={applyPipelineToWorkflow.isPending}
            isLoading={
              pipelinePageQuery.isLoading ||
              (Boolean(selectedSnapshotPipelineId) &&
                selectedPipelineSnapshotQuery.isPending)
            }
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
                  const last = lastQaAnswersRef.current
                  if (last) {
                    submitWorkflowGeneration(last)
                    return
                  }
                  handleOpenQaWizard(workflowPrompt.trim(), false)
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
          title={t("fab.workflowContents")}
        >
          <Library className="size-4" />
        </button>
        <button
          type="button"
          className="pointer-events-auto flex size-10 items-center justify-center rounded-full border bg-card shadow-sm"
          style={{ borderColor: T.surfaceBorder, color: T.textPrimary }}
          onClick={() => navigate("/home")}
          title={t("fab.goHome")}
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
          title={t("fab.goToRules")}
        >
          <FileStack className="size-4" />
        </button>
      </div>

      <PipelineStopConfirmDialog
        pipelineId={pipelineId}
        open={stopPipelineDialogOpen}
        onOpenChange={setStopPipelineDialogOpen}
        onStopped={() => {
          resetPipelineProcessingState()
          toast.success(t("toasts.pipelineStopped"))
        }}
        onError={(message) => toast.error(message)}
      />

      <WorkflowRunConfirmDialog
        open={runConfirmOpen}
        onOpenChange={(open) => {
          setRunConfirmOpen(open)
          if (!open) setPendingRunPrompt(null)
        }}
        workflowId={activeWorkflowId}
        ruleId={ruleId}
        isStarting={startPipelineMutation.isPending}
        showFreshnessWarning={!workflowHasIntelligenceNode(apiNodes ?? [])}
        onConfirm={() => {
          if (pendingRunPrompt != null) {
            runStartPipelineMutation(pendingRunPrompt)
          }
        }}
      />

      <GenerationCreditConfirmDialog
        open={workflowGenConfirmOpen}
        onOpenChange={(open) => {
          setWorkflowGenConfirmOpen(open)
          if (!open) pendingWorkflowAnswersRef.current = null
        }}
        kind="workflow"
        isSubmitting={
          generateWorkflow.isPending || regenerateWorkflowByRule.isPending
        }
        onConfirm={() => {
          const answers = pendingWorkflowAnswersRef.current
          if (!answers) return
          setWorkflowGenConfirmOpen(false)
          executeWorkflowGeneration(answers)
          pendingWorkflowAnswersRef.current = null
        }}
      />

      <WorkflowQaWizard
        open={qaWizardOpen}
        onOpenChange={setQaWizardOpen}
        ruleChannelIds={ruleChannelIds}
        initialMessage={qaInitialMessage}
        isSubmitting={
          generateWorkflow.isPending || regenerateWorkflowByRule.isPending
        }
        onSubmit={submitWorkflowGeneration}
      />

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
    </PageShell>
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

