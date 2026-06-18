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
import { useTranslation } from "react-i18next"
import { useLocation, useNavigate } from "react-router-dom"
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
import { RuleDetailForm } from "@/features/rules/components/rule-detail-form"
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
  addListItemFromNode,
  buildRuleFlow,
  createRuleFromPrompt,
  removeListItemFromNode,
  updateRuleFromNode,
  type RuleEntity,
} from "@/features/rules/data/rules-mock"
import {
  useExtractRuleMutation,
  usePutRuleMutation,
  useRuleByIdQuery,
  useRulesPageQuery,
} from "@/shared/queries/rule.query"
import type { RuleReplacePayload } from "@/shared/services/rule.service"
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

function isVisibleRuleListItem(rule: { status: string }): boolean {
  return rule.status !== "failed"
}

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
  const { t } = useTranslation("rules")
  const { t: tc } = useTranslation("common")
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
  const [treeDraft, setTreeDraft] = useState<RuleEntity | null>(null)

  const extractRuleMutation = useExtractRuleMutation()
  const putRuleMutation = usePutRuleMutation()

  const pageList = useMemo(
    () => (rulesPageQuery.data?.data ?? []).filter(isVisibleRuleListItem),
    [rulesPageQuery.data?.data],
  )
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
    const pageData = (drawerRulesPageQuery.data?.data ?? []).filter(
      isVisibleRuleListItem,
    )
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
          edited: t("page.editedJustNow"),
        })
      }
      return Array.from(map.values())
    })
  }, [drawerPage, drawerRulesPageQuery.data?.data, rulesDrawerOpen, t])

  useEffect(() => {
    if (processingRuleId) return
    if (!pageList.length) {
      setSelectedRuleId(undefined)
      return
    }
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
  }, [pageList, processingRuleId, routeState.selectedRuleId])

  const showExtractionOverlay =
    Boolean(processingRuleId) ||
    (progressStep === "failed" && Boolean(failureMessage))

  const dismissExtractionFailure = useCallback(() => {
    const failedRuleId = processingRuleId
    setProcessingRuleId(null)
    setProgressStep("idle")
    setFailureMessage("")
    setStreamedContent("")
    if (failedRuleId) leaveRuleRoom(failedRuleId)
    setSelectedRuleId((prev) => {
      if (!pageList.length) return undefined
      if (prev && pageList.some((r) => r.ruleId === prev)) return prev
      return pageList[0]?.ruleId
    })
  }, [pageList, processingRuleId])

  const handleExtractionTryAgain = useCallback(() => {
    dismissExtractionFailure()
    setCreateDialogOpen(true)
  }, [dismissExtractionFailure])

  const summaries = useMemo(
    () =>
      pageList.map((rule: RuleListItem) => ({
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
        edited: t("page.editedJustNow"),
      })),
    [pageList, t]
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

  useEffect(() => {
    if (!selectedRule) return
    setTreeDraft((prev) => {
      if (!prev || prev.ruleId !== selectedRule.ruleId) {
        return selectedRule
      }
      // While extracting we cache a placeholder rule (`processing`). After completion the
      // query refetches the real rule — we must replace the draft or we keep stale status and
      // every list field looks "edited" vs server (false "N pending" / save bar).
      if (prev.status === "processing" && selectedRule.status !== "processing") {
        return selectedRule
      }
      return prev
    })
  }, [selectedRule])

  const treeWorkingRule = treeDraft?.ruleId === selectedRule?.ruleId ? treeDraft : selectedRule

  const flow = useMemo(() => {
    if (!treeWorkingRule) return { nodes: [] as Node[], edges: [] as Edge[] }
    return buildRuleFlow(treeWorkingRule, t)
  }, [treeWorkingRule, t])

  const handleDetailSave = useCallback(
    async (values: RuleEntity) => {
      if (!selectedRuleId) return values
      if (values.status === "processing") return values
      try {
        const data = await putRuleMutation.mutateAsync({
          ruleId: selectedRuleId,
          body: toReplacePayload(values),
        })
        toast.success(t("toast.ruleSaved"), { id: "rule-detail-save" })
        return data
      } catch (err) {
        toast.error(apiErrorMessage(err, t("toast.couldNotSaveRule")))
        return values
      }
    },
    [putRuleMutation, selectedRuleId, t]
  )

  const onSaveNode = useCallback(
    (fieldPath: string, nextValue: string) => {
      setTreeDraft((prev) => {
        if (!prev || prev.status === "processing") return prev
        return updateRuleFromNode(prev, fieldPath, nextValue)
      })
    },
    []
  )

  const onAddNodeItem = useCallback((fieldPath: string) => {
    setTreeDraft((prev) => {
      if (!prev || prev.status === "processing") return prev
      return addListItemFromNode(prev, fieldPath)
    })
  }, [])

  const onRemoveNodeItem = useCallback((fieldPath: string) => {
    setTreeDraft((prev) => {
      if (!prev || prev.status === "processing") return prev
      return removeListItemFromNode(prev, fieldPath)
    })
  }, [])

  const onSaveNodeRef = useRef(onSaveNode)
  onSaveNodeRef.current = onSaveNode
  const onAddNodeItemRef = useRef(onAddNodeItem)
  onAddNodeItemRef.current = onAddNodeItem
  const onRemoveNodeItemRef = useRef(onRemoveNodeItem)
  onRemoveNodeItemRef.current = onRemoveNodeItem

  const enhancedNodes = useMemo(() => {
    return flow.nodes.map((node) => {
      const base = node.data as RuleFlowNodeData
      return {
        ...node,
        data: {
          ...base,
          onSaveNode: (fp: string, nextValue: string) =>
            onSaveNodeRef.current(fp, nextValue),
          onAddNodeItem: (fp: string) => onAddNodeItemRef.current(fp),
          onRemoveNodeItem: (fp: string) => onRemoveNodeItemRef.current(fp),
        },
      }
    }) as Node<BubbleNodeData>[]
  }, [flow.nodes])

  const treeDraftDirty = useMemo(() => {
    if (!selectedRule || !treeWorkingRule) return false
    return (
      JSON.stringify(toReplacePayload(treeWorkingRule)) !==
      JSON.stringify(toReplacePayload(selectedRule))
    )
  }, [selectedRule, treeWorkingRule])

  const treeListChangeCount = useMemo(() => {
    if (!selectedRule || !treeWorkingRule) return 0

    const countListDiff = (a: string[], b: string[]) => {
      const length = Math.max(a.length, b.length)
      let changed = 0
      for (let i = 0; i < length; i += 1) {
        if ((a[i] ?? "") !== (b[i] ?? "")) changed += 1
      }
      return changed
    }

    return (
      countListDiff(selectedRule.brand.brandTone, treeWorkingRule.brand.brandTone) +
      countListDiff(selectedRule.audience.location, treeWorkingRule.audience.location) +
      countListDiff(selectedRule.audience.interests, treeWorkingRule.audience.interests) +
      countListDiff(selectedRule.campaign.goals, treeWorkingRule.campaign.goals) +
      countListDiff(selectedRule.campaign.keywords, treeWorkingRule.campaign.keywords) +
      countListDiff(selectedRule.campaign.contentFormats, treeWorkingRule.campaign.contentFormats) +
      countListDiff(
        selectedRule.contentGuidelines.dos,
        treeWorkingRule.contentGuidelines.dos
      ) +
      countListDiff(
        selectedRule.contentGuidelines.donts,
        treeWorkingRule.contentGuidelines.donts
      ) +
      countListDiff(
        selectedRule.channels.map((c) => c.channel),
        treeWorkingRule.channels.map((c) => c.channel)
      )
    )
  }, [selectedRule, treeWorkingRule])

  const handleDiscardTreeDraft = useCallback(() => {
    if (selectedRule) setTreeDraft(selectedRule)
  }, [selectedRule])

  const handleSaveTreeDraft = useCallback(async () => {
    if (!selectedRuleId || !treeWorkingRule || !treeDraftDirty) return
    if (treeWorkingRule.status === "processing") return
    try {
      const data = await putRuleMutation.mutateAsync({
        ruleId: selectedRuleId,
        body: toReplacePayload(treeWorkingRule),
      })
      setTreeDraft(data)
      toast.success(t("toast.treeChangesSaved"))
    } catch (err) {
      toast.error(apiErrorMessage(err, t("toast.couldNotSaveTree")))
    }
  }, [putRuleMutation, selectedRuleId, treeWorkingRule, treeDraftDirty, t])

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
      setFailureMessage(message ?? t("toast.generationFailed"))
      void queryClient.invalidateQueries({ queryKey: ["rules", "pageable"] })
      void queryClient.invalidateQueries({ queryKey: ["rule", ruleId] })
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
  }, [hydrateCompletedRule, processingRuleId, queryClient, t])

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
          const msg = t("toast.fileTooLarge", {
            name: a.label,
            maxMb: formatMaxFileSizeMb(RULE_EXTRACT_MAX_FILE_BYTES),
          })
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
        t("page.attachmentsFallback")
      const nextRule = {
        ...createRuleFromPrompt(previewLabel),
        ruleId,
        name: t("page.processingRuleName"),
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
      toast.success(t("toast.extractionStarted"))
    } catch (err) {
      const message = apiErrorMessage(err, t("toast.couldNotStartExtraction"))
      setProgressStep("failed")
      setFailureMessage(message)
      toast.error(message)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{t("page.title")}</h1>
          {rulesPageQuery.isError ? (
            <p className="text-xs text-red-600">
              {t("page.loadError")}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setRulesDrawerOpen(true)}>
            {t("page.rulesList")}
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
            {t("page.createByPrompt")}
          </Button>
          <Button
            variant="outline"
            disabled={!selectedRuleId}
            onClick={() =>
              selectedRuleId &&
              navigate(`/rules/${selectedRuleId}/news-trigger`)
            }
          >
            {t("page.newsAutoGenerate")}
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
            {t("page.continue")}
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
                {t("page.viewTree")}
              </TabsTrigger>
              <TabsTrigger
                value="detail"
                className="rounded-full px-3 py-1 text-xs"
              >
                {t("page.viewDetail")}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {showExtractionOverlay ? (
          <RuleExtractionProgress
            ruleId={processingRuleId ?? ""}
            progressStep={progressStep}
            failureMessage={failureMessage}
            streamedContent={streamedContent}
            onDismiss={failureMessage ? dismissExtractionFailure : undefined}
            onTryAgain={failureMessage ? handleExtractionTryAgain : undefined}
          />
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col pt-10">
          {!selectedRuleId ? (
            <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
              {t("page.selectOrCreate")}
            </div>
          ) : ruleDetailQuery.isError ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8">
              <p className="text-center text-sm text-destructive">
                {t("page.loadRuleError")}
              </p>
              <Button
                variant="outline"
                onClick={() => void ruleDetailQuery.refetch()}
              >
                {tc("actions.retry")}
              </Button>
            </div>
          ) : showRuleSkeleton && viewMode === "tree" ? (
            <RuleFlowSkeleton />
          ) : showRuleSkeleton && viewMode === "detail" ? (
            <div className="min-h-0 flex-1 overflow-y-auto scroll-smooth px-4 pt-1 pb-4">
              <RuleDetailViewSkeleton />
            </div>
          ) : selectedRule?.status === "failed" ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
              <p className="text-sm font-medium text-destructive">
                {t("extraction.titleFailed")}
              </p>
              <p className="max-w-md text-sm text-muted-foreground">
                {t("extraction.failedHint")}
              </p>
              <Button type="button" onClick={handleExtractionTryAgain}>
                {t("extraction.tryAgain")}
              </Button>
            </div>
          ) : selectedRule && viewMode === "tree" ? (
            <div className="relative min-h-0 flex-1">
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
              {treeDraftDirty ? (
                <div className="pointer-events-none absolute right-4 bottom-4 z-20 flex justify-end">
                  <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border/80 bg-background/95 px-3 py-2 shadow-lg backdrop-blur-sm">
                    <span className="px-2 text-xs text-muted-foreground">
                      {t("page.pendingChanges", { count: treeListChangeCount })}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="rounded-full px-4"
                      onClick={handleDiscardTreeDraft}
                      disabled={putRuleMutation.isPending}
                    >
                      {t("page.discardAll")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="rounded-full px-4"
                      onClick={() => void handleSaveTreeDraft()}
                      disabled={putRuleMutation.isPending || !treeDraftDirty}
                    >
                      {t("page.saveChanges")}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : selectedRule && viewMode === "detail" ? (
            <RuleDetailForm
              rule={selectedRule}
              isSaving={putRuleMutation.isPending}
              onSubmit={handleDetailSave}
            />
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
        initialPrompt={createPrompt}
        onPromptChange={setCreatePrompt}
        promptAreaKey={createDialogKey}
        onExtract={runRuleExtract}
      />
    </div>
  )
}
