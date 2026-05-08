import "@xyflow/react/dist/style.css"

import { useQueryClient } from "@tanstack/react-query"
import { isAxiosError } from "axios"
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
} from "@xyflow/react"
import type { Attachment } from "@/components/core/prompt-area"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  ruleFlowNodeTypes,
  type BubbleNodeData,
} from "@/features/rules/components/bubble-node"
import { CreateRuleDialog } from "@/features/rules/components/create-rule-dialog"
import { RuleDetailView } from "@/features/rules/components/rule-detail-view"
import { RuleDetailViewSkeleton } from "@/features/rules/components/rule-detail-view-skeleton"
import { RuleExtractionProgress } from "@/features/rules/components/rule-extraction-progress"
import { RuleFlowSkeleton } from "@/features/rules/components/rule-flow-skeleton"
import {
  FloatingConnectionLine,
  ruleFlowEdgeTypes,
} from "@/features/rules/components/rule-flow-edge"
import { RulesListDrawer } from "@/features/rules/components/rules-list-drawer"
import {
  type RuleFlowNodeData,
  buildRuleFlow,
  createRuleFromPrompt,
  updateRuleFromNode,
  type RuleEntity,
} from "@/features/rules/data/rules-mock"
import {
  useExtractRuleMutation,
  usePatchRuleMutation,
  usePutRuleMutation,
  useRuleByIdQuery,
  useRulesPageQuery,
} from "@/shared/queries/rule.query"
import type {
  RulePatchPayload,
  RuleReplacePayload,
} from "@/shared/services/rule.service"
import type { RuleListItem } from "@/shared/services/rule.service"
import {
  formatMaxFileSizeMb,
  RULE_EXTRACT_MAX_FILE_BYTES,
} from "@/lib/rule-extract-limits"
import { buildRuleExtractFormData } from "@/lib/strategy-input"
import {
  joinRuleRoom,
  leaveRuleRoom,
  onRuleCompleted,
  onRuleFailed,
  onRuleInputProcessed,
  onRuleReadingInput,
  onRuleStarted,
  onRuleStreaming,
} from "@/shared/socket/rule-events"

type RuleViewMode = "tree" | "detail"
const RULES_DRAWER_PAGE_LIMIT = 8

function apiErrorMessage(error: unknown, fallback: string): string {
  if (isAxiosError(error)) {
    const data = error.response?.data as unknown
    if (typeof data === "string" && data.trim()) return data
    if (data && typeof data === "object") {
      const msg = (data as Record<string, unknown>).message
      if (typeof msg === "string" && msg.trim()) return msg
      if (Array.isArray(msg) && typeof msg[0] === "string")
        return msg.join(", ")
    }
    if (error.message) return error.message
  }
  if (error instanceof Error && error.message) return error.message
  return fallback
}

function treeSectionPatch(
  fieldKey: string,
  merged: RuleEntity
): RulePatchPayload {
  switch (fieldKey) {
    case "brand":
      return { brand: merged.brand }
    case "audience":
      return { audience: merged.audience }
    case "campaign":
      return { campaign: merged.campaign }
    case "channels":
      return { channels: merged.channels }
    case "contentGuidelines":
      return { contentGuidelines: merged.contentGuidelines }
    default:
      return {}
  }
}

function toReplacePayload(rule: RuleEntity): RuleReplacePayload {
  return {
    name: rule.name,
    brand: rule.brand,
    audience: rule.audience,
    campaign: rule.campaign,
    channels: rule.channels,
    contentGuidelines: rule.contentGuidelines,
  }
}

function mergeFlowNodePositions<T extends Node>(next: T[], prev: T[]): T[] {
  const prevById = new Map(prev.map((n) => [n.id, n]))
  return next.map((n) => {
    const p = prevById.get(n.id)
    if (!p) return n
    return {
      ...n,
      position: p.position,
      ...(p.selected !== undefined ? { selected: p.selected } : {}),
    }
  })
}

export default function RulesPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const routeState = (location.state ?? {}) as {
    selectedRuleId?: string
    sourcePrompt?: string
  }
  const queryClient = useQueryClient()

  const pageableQueryBody = useMemo(
    () =>
      ({
        page: 1,
        limit: 100,
        sortBy: "updatedAt",
        sortOrder: "desc",
      }) as const,
    []
  )
  const rulesPageQuery = useRulesPageQuery(pageableQueryBody)

  const [selectedRuleId, setSelectedRuleId] = useState<string | undefined>(
    routeState.selectedRuleId
  )
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [rulesDrawerOpen, setRulesDrawerOpen] = useState(false)
  const [drawerPage, setDrawerPage] = useState(1)
  const [drawerSummaries, setDrawerSummaries] = useState<
    Array<{
      ruleId: string
      name: string
      tones: string[]
      channels: string[]
      status: "active" | "draft" | "archived" | "processing" | "failed"
      edited: string
    }>
  >([])
  const [createPrompt, setCreatePrompt] = useState(
    routeState.sourcePrompt ?? ""
  )
  const [createDialogKey, setCreateDialogKey] = useState(0)
  const [processingRuleId, setProcessingRuleId] = useState<string | null>(null)
  const [progressStep, setProgressStep] = useState<
    | "idle"
    | "started"
    | "reading_input"
    | "input_processed"
    | "streaming"
    | "completed"
    | "failed"
  >("idle")
  const [streamedContent, setStreamedContent] = useState("")
  const [failureMessage, setFailureMessage] = useState("")
  const [viewMode, setViewMode] = useState<RuleViewMode>("tree")
  const [treeSavePendingKey, setTreeSavePendingKey] = useState<string | null>(
    null
  )
  const [detailDraft, setDetailDraft] = useState<RuleEntity | null>(null)

  const extractRuleMutation = useExtractRuleMutation()
  const patchRuleMutation = usePatchRuleMutation()
  const putRuleMutation = usePutRuleMutation()

  const prevViewModeRef = useRef<RuleViewMode>(viewMode)
  const detailSyncedRuleIdRef = useRef<string | null>(null)

  const pageList = rulesPageQuery.data?.data
  const drawerRulesPageQuery = useRulesPageQuery(
    {
      page: drawerPage,
      limit: RULES_DRAWER_PAGE_LIMIT,
      sortBy: "updatedAt",
      sortOrder: "desc",
    },
    rulesDrawerOpen
  )

  useEffect(() => {
    if (!rulesDrawerOpen) return
    setDrawerPage(1)
    setDrawerSummaries([])
  }, [rulesDrawerOpen])

  useEffect(() => {
    if (!rulesDrawerOpen) return
    const pageData = drawerRulesPageQuery.data?.data ?? []
    if (!pageData.length && drawerPage !== 1) return
    setDrawerSummaries((prev) => {
      const base = drawerPage === 1 ? [] : prev
      const map = new Map(base.map((r) => [r.ruleId, r]))
      for (const rule of pageData as RuleListItem[]) {
        map.set(rule.ruleId, {
          ruleId: rule.ruleId,
          name: rule.name,
          tones: rule.tones,
          channels: rule.channels,
          status: rule.status as
            | "active"
            | "draft"
            | "archived"
            | "processing"
            | "failed",
          edited: "just now",
        })
      }
      return Array.from(map.values())
    })
  }, [drawerPage, drawerRulesPageQuery.data?.data, rulesDrawerOpen])

  useEffect(() => {
    if (!pageList?.length) return
    const ids = pageList.map((r) => r.ruleId)
    setSelectedRuleId((prev) => {
      if (prev && ids.includes(prev)) return prev
      if (
        routeState.selectedRuleId &&
        ids.includes(routeState.selectedRuleId)
      ) {
        return routeState.selectedRuleId
      }
      return ids[0]
    })
  }, [pageList, routeState.selectedRuleId])

  const summaries = useMemo(
    () =>
      (pageList ?? []).map((rule: RuleListItem) => ({
        ruleId: rule.ruleId,
        name: rule.name,
        tones: rule.tones,
        channels: rule.channels,
        status: rule.status as
          | "active"
          | "draft"
          | "archived"
          | "processing"
          | "failed",
        edited: "just now",
      })),
    [pageList]
  )

  const canLoadMoreDrawerRules =
    (drawerRulesPageQuery.data?.meta.totalPages ?? 1) > drawerPage
  const handleLoadMoreDrawerRules = useCallback(() => {
    if (drawerRulesPageQuery.isFetching) return
    if (!canLoadMoreDrawerRules) return
    setDrawerPage((p) => p + 1)
  }, [canLoadMoreDrawerRules, drawerRulesPageQuery.isFetching])

  const ruleDetailQuery = useRuleByIdQuery<RuleEntity>(
    selectedRuleId,
    Boolean(selectedRuleId)
  )
  const selectedRule = ruleDetailQuery.data
  const showRuleSkeleton =
    Boolean(selectedRuleId) &&
    !ruleDetailQuery.isError &&
    ruleDetailQuery.isLoading

  const flow = useMemo(() => {
    if (!selectedRule) return { nodes: [] as Node[], edges: [] as Edge[] }
    return buildRuleFlow(selectedRule)
  }, [selectedRule])

  useEffect(() => {
    const enteredDetail =
      prevViewModeRef.current !== "detail" && viewMode === "detail"
    prevViewModeRef.current = viewMode

    if (viewMode !== "detail" || !selectedRule) return

    const ruleId = selectedRule.ruleId
    const shouldReset =
      enteredDetail || detailSyncedRuleIdRef.current !== ruleId

    if (shouldReset) {
      detailSyncedRuleIdRef.current = ruleId
      setDetailDraft(selectedRule)
    }
  }, [viewMode, selectedRule])

  const detailWorking = detailDraft ?? selectedRule
  const isDetailDirty = useMemo(() => {
    if (!selectedRule || !detailWorking) return false
    return (
      JSON.stringify(toReplacePayload(detailWorking)) !==
      JSON.stringify(toReplacePayload(selectedRule))
    )
  }, [detailWorking, selectedRule])

  const handleDetailSave = useCallback(() => {
    if (!selectedRuleId || !detailWorking) return
    if (detailWorking.status === "processing") return
    putRuleMutation.mutate(
      {
        ruleId: selectedRuleId,
        body: toReplacePayload(detailWorking),
      },
      {
        onSuccess: (data) => {
          toast.success("Rule saved", { id: "rule-detail-save" })
          setDetailDraft({ ...data })
        },
        onError: (err) =>
          toast.error(apiErrorMessage(err, "Could not save rule")),
      }
    )
  }, [detailWorking, putRuleMutation.mutate, selectedRuleId])

  const handleDetailCancel = useCallback(() => {
    if (selectedRule) setDetailDraft(selectedRule)
  }, [selectedRule])

  const onSaveNode = useCallback(
    (fieldKey: string, nextValue: string) => {
      if (!selectedRuleId) return
      const old = queryClient.getQueryData<RuleEntity>(["rule", selectedRuleId])
      if (!old) return
      if (old.status === "processing") return
      const next = updateRuleFromNode(old, fieldKey, nextValue)
      const patch = treeSectionPatch(fieldKey, next)
      if (Object.keys(patch).length === 0) return
      queryClient.setQueryData<RuleEntity>(["rule", selectedRuleId], next)
      setTreeSavePendingKey(fieldKey)
      patchRuleMutation.mutate(
        { ruleId: selectedRuleId, patch },
        {
          onSuccess: () => toast.success("Changes saved"),
          onError: (err) => {
            toast.error(apiErrorMessage(err, "Could not save changes"))
            queryClient.setQueryData<RuleEntity>(["rule", selectedRuleId], old)
          },
          onSettled: () => {
            setTreeSavePendingKey((prev) => (prev === fieldKey ? null : prev))
          },
        }
      )
    },
    // `useMutation()`'s return object identity can change every render; depend on `mutate` only.
    [patchRuleMutation.mutate, queryClient, selectedRuleId]
  )

  const onSaveNodeRef = useRef(onSaveNode)
  onSaveNodeRef.current = onSaveNode

  const onDetailDraftChange = useCallback((next: RuleEntity) => {
    setDetailDraft(next)
  }, [])

  const enhancedNodes = useMemo(() => {
    return flow.nodes.map((node) => {
      const base = node.data as RuleFlowNodeData
      const fieldKey = base.fieldKey
      return {
        ...node,
        data: {
          ...base,
          savePending:
            typeof fieldKey === "string" && treeSavePendingKey === fieldKey,
          onSaveNode: (fk: string, nextValue: string) =>
            onSaveNodeRef.current(fk, nextValue),
        },
      }
    }) as Node<BubbleNodeData>[]
  }, [flow.nodes, treeSavePendingKey])

  const enhancedEdges = useMemo(() => {
    return flow.edges.map((edge) => ({
      ...edge,
      type: "floating",
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 18,
        height: 18,
        color: "#8A96A8",
      },
      animated: true,
      style: {
        stroke: "#8A96A8",
        strokeOpacity: 0.55,
        strokeWidth: 1.5,
        ...edge.style,
      },
    })) as Edge[]
  }, [flow.edges])

  const [canvasNodes, setCanvasNodes, onNodesChange] = useNodesState<
    Node<BubbleNodeData>
  >([])
  const [canvasEdges, setCanvasEdges, onEdgesChange] = useEdgesState<Edge>([])

  useLayoutEffect(() => {
    setCanvasNodes((prev) => mergeFlowNodePositions(enhancedNodes, prev))
  }, [enhancedNodes, setCanvasNodes])

  useLayoutEffect(() => {
    setCanvasEdges(enhancedEdges)
  }, [enhancedEdges, setCanvasEdges])

  const hydrateCompletedRule = useCallback(
    async (ruleId: string) => {
      setProgressStep("completed")
      setSelectedRuleId(ruleId)
      await queryClient.invalidateQueries({ queryKey: ["rules", "pageable"] })
      await queryClient.invalidateQueries({ queryKey: ["rule", ruleId] })
      setProcessingRuleId(null)
      leaveRuleRoom(ruleId)
    },
    [queryClient]
  )

  useEffect(() => {
    if (!processingRuleId) return

    const cleanupStarted = onRuleStarted(({ ruleId }) => {
      if (ruleId !== processingRuleId) return
      setProgressStep("started")
    })

    const cleanupReadingInput = onRuleReadingInput(({ ruleId }) => {
      if (ruleId !== processingRuleId) return
      setProgressStep("reading_input")
    })

    const cleanupInputProcessed = onRuleInputProcessed(({ ruleId }) => {
      if (ruleId !== processingRuleId) return
      setProgressStep("input_processed")
    })

    const cleanupStreaming = onRuleStreaming(({ ruleId, chunk }) => {
      if (ruleId !== processingRuleId) return
      setProgressStep("streaming")
      setStreamedContent((prev) => `${prev}${prev ? " " : ""}${chunk}`)
    })

    const cleanupCompleted = onRuleCompleted(({ ruleId }) => {
      if (ruleId !== processingRuleId) return
      void hydrateCompletedRule(ruleId)
    })

    const cleanupFailed = onRuleFailed(({ ruleId, message }) => {
      if (ruleId !== processingRuleId) return
      setProgressStep("failed")
      setFailureMessage(message ?? "Rule generation failed")
      void queryClient.invalidateQueries({ queryKey: ["rules", "pageable"] })
      void queryClient.invalidateQueries({ queryKey: ["rule", ruleId] })
      setProcessingRuleId(null)
      leaveRuleRoom(ruleId)
    })

    return () => {
      cleanupStarted()
      cleanupReadingInput()
      cleanupInputProcessed()
      cleanupStreaming()
      cleanupCompleted()
      cleanupFailed()
    }
  }, [hydrateCompletedRule, processingRuleId, queryClient])

  async function runRuleExtract(text: string, attachments: Attachment[]) {
    const trimmed = text.trim()
    const hasFile = attachments.some(
      (a) => a.type === "file" && a.data instanceof File
    )
    const hasUrl = attachments.some((a) => a.type === "url")
    if (!trimmed && !hasFile && !hasUrl) return

    for (const a of attachments) {
      if (a.type === "file" && a.data instanceof File) {
        if (a.data.size > RULE_EXTRACT_MAX_FILE_BYTES) {
          const msg = `File "${a.label}" exceeds maximum size (${formatMaxFileSizeMb(RULE_EXTRACT_MAX_FILE_BYTES)} MB).`
          toast.error(msg)
          setProgressStep("failed")
          setFailureMessage(msg)
          return
        }
      }
    }

    try {
      const formData = buildRuleExtractFormData(text, attachments)
      const { ruleId } = await extractRuleMutation.mutateAsync(formData)
      const previewLabel =
        trimmed ||
        attachments
          .map((a) => a.label)
          .filter(Boolean)
          .join(", ") ||
        "attachments"
      const nextRule = {
        ...createRuleFromPrompt(previewLabel),
        ruleId,
        name: "Processing rule",
        status: "processing" as const,
      }

      queryClient.setQueryData<RuleEntity>(["rule", ruleId], nextRule)
      void queryClient.invalidateQueries({ queryKey: ["rules", "pageable"] })
      setSelectedRuleId(ruleId)
      setCreateDialogOpen(false)
      setCreatePrompt("")
      setProcessingRuleId(ruleId)
      setProgressStep("idle")
      setFailureMessage("")
      setStreamedContent("")
      joinRuleRoom(ruleId)
      toast.success("Rule extraction started")
    } catch (err) {
      const message = apiErrorMessage(err, "Unable to start rule extraction")
      setProgressStep("failed")
      setFailureMessage(message)
      toast.error(message)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Rule setup</h1>
          {rulesPageQuery.isError ? (
            <p className="text-xs text-red-600">
              Could not load rules from the server.
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setRulesDrawerOpen(true)}>
            Rules list
          </Button>
          <RulesListDrawer
            open={rulesDrawerOpen}
            onOpenChange={setRulesDrawerOpen}
            summaries={rulesDrawerOpen ? drawerSummaries : summaries}
            selectedRuleId={selectedRuleId ?? ""}
            onSelectRule={setSelectedRuleId}
            hasMore={rulesDrawerOpen ? canLoadMoreDrawerRules : false}
            isLoadingMore={rulesDrawerOpen ? drawerRulesPageQuery.isFetching : false}
            onLoadMore={handleLoadMoreDrawerRules}
          />

          <Button onClick={() => setCreateDialogOpen(true)}>
            Create by prompt
          </Button>
          <Button
            variant="outline"
            disabled={!selectedRuleId}
            onClick={() =>
              navigate(`/workflow/${selectedRuleId}`, {
                state: {
                  ruleName: selectedRule?.name,
                },
              })
            }
          >
            Continue
          </Button>
        </div>
      </div>

      <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-background">
        <div className="pointer-events-auto absolute top-3 right-3 z-20 rounded-full border border-border/80 bg-background/95 p-0.5 shadow-md backdrop-blur-sm">
          <Tabs
            orientation="horizontal"
            value={viewMode}
            onValueChange={(value) => setViewMode(value as RuleViewMode)}
          >
            <TabsList
              variant="default"
              className="h-8 gap-0 border-0 bg-transparent p-0"
            >
              <TabsTrigger
                value="tree"
                className="rounded-full px-3 py-1 text-xs"
              >
                Tree
              </TabsTrigger>
              <TabsTrigger
                value="detail"
                className="rounded-full px-3 py-1 text-xs"
              >
                Detail
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {processingRuleId ? (
          <RuleExtractionProgress
            ruleId={processingRuleId}
            progressStep={progressStep}
            failureMessage={failureMessage}
            streamedContent={streamedContent}
          />
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col pt-10">
          {!selectedRuleId ? (
            <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
              Select or create a rule
            </div>
          ) : ruleDetailQuery.isError ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8">
              <p className="text-center text-sm text-destructive">
                Could not load this rule.
              </p>
              <Button
                variant="outline"
                onClick={() => void ruleDetailQuery.refetch()}
              >
                Retry
              </Button>
            </div>
          ) : showRuleSkeleton && viewMode === "tree" ? (
            <RuleFlowSkeleton />
          ) : showRuleSkeleton && viewMode === "detail" ? (
            <div className="min-h-0 flex-1 overflow-y-auto scroll-smooth px-4 pt-1 pb-4">
              <RuleDetailViewSkeleton />
            </div>
          ) : selectedRule && viewMode === "tree" ? (
            <ReactFlow
              nodes={canvasNodes}
              edges={canvasEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              nodeTypes={ruleFlowNodeTypes}
              edgeTypes={ruleFlowEdgeTypes}
              connectionLineComponent={FloatingConnectionLine}
              fitView
              nodesConnectable={false}
              nodesDraggable
              edgesFocusable={false}
              elementsSelectable
              panOnDrag
              zoomOnScroll
              className="h-full min-h-0 w-full flex-1"
            >
              <Background gap={18} size={1} />
              <Controls showInteractive={false} />
            </ReactFlow>
          ) : selectedRule && viewMode === "detail" && detailWorking ? (
            <div className="relative min-h-0 flex-1">
              <div className="h-full min-h-0 overflow-y-auto scroll-smooth px-4 pt-1 pb-28">
                <RuleDetailView
                  rule={detailWorking}
                  onRuleChange={onDetailDraftChange}
                />
              </div>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pt-3 pb-5">
                <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border/80 bg-background/95 px-3 py-2 shadow-lg backdrop-blur-sm">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-full px-5"
                    onClick={handleDetailCancel}
                    disabled={putRuleMutation.isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="rounded-full px-5"
                    onClick={handleDetailSave}
                    disabled={
                      putRuleMutation.isPending ||
                      !isDetailDirty ||
                      detailWorking.status === "processing"
                    }
                  >
                    {putRuleMutation.isPending ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2
                          className="size-4 shrink-0 animate-spin"
                          aria-hidden
                        />
                        Saving…
                      </span>
                    ) : (
                      "Save"
                    )}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <CreateRuleDialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          setCreateDialogOpen(open)
          if (open) {
            setCreateDialogKey((k) => k + 1)
          }
        }}
        prompt={createPrompt}
        onPromptChange={setCreatePrompt}
        promptAreaKey={createDialogKey}
        onExtract={runRuleExtract}
      />
    </div>
  )
}
