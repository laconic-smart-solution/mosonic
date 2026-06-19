import "@xyflow/react/dist/style.css"

import { useQueryClient } from "@tanstack/react-query"
import { isAxiosError } from "axios"
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react"
import { useTranslation } from "react-i18next"
import { useLocation, useNavigate } from "react-router-dom"
import { toast } from "sonner"
import {
  applyNodeChanges,
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  type Edge,
  type Node,
  type NodeChange,
} from "@xyflow/react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  ruleFlowNodeTypes,
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
import { useRuleFlowVisualTheme } from "@/features/rules/lib/rule-flow-theme"
import {
  buildRuleFlow,
  createRuleFromPrompt,
  type RuleEntity,
} from "@/features/rules/data/rules-mock"
import { useRuleExtraction } from "@/features/rules/hooks/use-rule-extraction"
import {
  usePutRuleMutation,
  useRuleByIdQuery,
  useRulesPageQuery,
} from "@/shared/queries/rule.query"
import type { RuleReplacePayload } from "@/shared/services/rule.service"
import type { RuleListItem } from "@/shared/services/rule.service"

type RuleViewMode = "tree" | "manage"
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
  const [viewMode, setViewMode] = useState<RuleViewMode>("tree")

  const putRuleMutation = usePutRuleMutation()
  const flowTheme = useRuleFlowVisualTheme()

  const pageList = useMemo(
    () => (rulesPageQuery.data?.data ?? []).filter(isVisibleRuleListItem),
    [rulesPageQuery.data?.data],
  )

  const handleExtractStarted = useCallback(
    (ruleId: string, previewLabel: string) => {
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
    },
    [queryClient, t],
  )

  const handleExtractCompleted = useCallback(
    async (ruleId: string) => {
      setSelectedRuleId(ruleId)
      await queryClient.invalidateQueries({ queryKey: ["rules", "pageable"] })
      await queryClient.invalidateQueries({ queryKey: ["rule", ruleId] })
    },
    [queryClient],
  )

  const {
    processingRuleId,
    progressStep,
    failureMessage,
    streamedContent,
    showOverlay: showExtractionOverlay,
    runExtract: runRuleExtract,
    dismissFailure,
    isPending: isExtracting,
  } = useRuleExtraction({
    onExtractStarted: handleExtractStarted,
    onCompleted: handleExtractCompleted,
  })

  const dismissExtractionFailure = useCallback(() => {
    dismissFailure()
    setSelectedRuleId((prev) => {
      if (!pageList.length) return undefined
      if (prev && pageList.some((r) => r.ruleId === prev)) return prev
      return pageList[0]?.ruleId
    })
  }, [dismissFailure, pageList])

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

  const flow = useMemo(() => {
    if (!selectedRule) return { nodes: [] as Node[], edges: [] as Edge[] }
    return buildRuleFlow(selectedRule, t)
  }, [selectedRule, t])

  const [flowNodes, setFlowNodes] = useState<Node[]>([])

  useEffect(() => {
    setFlowNodes(flow.nodes)
  }, [flow])

  const onFlowNodesChange = useCallback((changes: NodeChange[]) => {
    setFlowNodes((nodes) => applyNodeChanges(changes, nodes))
  }, [])

  const handleManageSave = useCallback(
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

  const enhancedEdges = useMemo(() => {
    return flow.edges.map((edge) => ({
      ...edge,
      type: "floating",
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 18,
        height: 18,
        color: flowTheme.edgeColor,
      },
      animated: true,
      style: {
        stroke: flowTheme.edgeColor,
        strokeOpacity: flowTheme.edgeOpacity,
        strokeWidth: flowTheme.edgeWidth,
        ...edge.style,
      },
    })) as Edge[]
  }, [flow.edges, flowTheme])

  return (
    <div className="flex h-full min-h-0 flex-col p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{t("page.title")}</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("drawer.description")}</p>
          {rulesPageQuery.isError ? (
            <p className="text-xs text-red-600 dark:text-red-400">
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

      <section className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-background dark:bg-[#0D1118]">
        <div className="pointer-events-auto absolute top-3 right-3 z-20 rounded-full border border-border/80 bg-background/95 p-0.5 shadow-md backdrop-blur-sm dark:border-border dark:bg-card/95">
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
                value="manage"
                className="rounded-full px-3 py-1 text-xs"
              >
                {t("page.viewManage")}
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
          ) : showRuleSkeleton && viewMode === "manage" ? (
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
                nodes={flowNodes}
                edges={enhancedEdges}
                nodeTypes={ruleFlowNodeTypes}
                edgeTypes={ruleFlowEdgeTypes}
                connectionLineComponent={FloatingConnectionLine}
                onNodesChange={onFlowNodesChange}
                fitView
                nodesConnectable={false}
                nodesDraggable
                nodesFocusable={false}
                edgesFocusable={false}
                elementsSelectable={false}
                panOnDrag
                zoomOnScroll
                className="rule-flow-canvas h-full min-h-0 w-full flex-1"
              >
                <Background
                  gap={18}
                  size={1}
                  color={flowTheme.backgroundDotColor}
                />
                <Controls showInteractive={false} />
              </ReactFlow>
            </div>
          ) : selectedRule && viewMode === "manage" ? (
            <RuleDetailForm
              rule={selectedRule}
              isSaving={putRuleMutation.isPending}
              onSubmit={handleManageSave}
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
        isExtracting={isExtracting}
      />
    </div>
  )
}
