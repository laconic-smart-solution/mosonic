import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"

import { HomeBackdrop } from "@/features/home/components/home-backdrop"
import { HomeFooter } from "@/features/home/components/home-footer"
import { HomeHelperLinks } from "@/features/home/components/home-helper-links"
import type { Attachment } from "@/components/core/prompt-area"
import { buildStrategyInput } from "@/lib/strategy-input"
import { HomePromptBar } from "@/features/home/components/home-prompt-bar"
import { HomeStage } from "@/features/home/components/home-stage"
import { HomeUserStrip } from "@/features/home/components/home-user-strip"
import { PROMPT_SUGGESTIONS } from "@/features/home/data/home-constants"
import { useRulesPageQuery } from "@/shared/queries/rule.query"
import { useGenerateWorkflow } from "@/shared/queries/workflow.query"
import type { RuleListItem } from "@/shared/services/rule.service"
import { joinWorkflowRoom } from "@/shared/socket/workflow-events"
import { T } from "@/lib/tokens"

export default function HomePage() {
  const navigate = useNavigate()
  const [prompt, setPrompt] = useState("")
  const [focused, setFocused] = useState(false)
  const [hovLeft, setHovLeft] = useState<number | null>(null)
  const [hovRight, setHovRight] = useState<number | null>(null)
  const [suggIndex, setSuggIndex] = useState(0)
  const [orbPulse, setOrbPulse] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [rulesPage, setRulesPage] = useState(1)
  const [ruleOptions, setRuleOptions] = useState<RuleListItem[]>([])
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null)

  const rulesPageQuery = useRulesPageQuery(
    {
      page: rulesPage,
      limit: 5,
      sortBy: "updatedAt",
      sortOrder: "desc",
      filter: {
        status: "active",
      },
    },
    true,
  )

  const generateWorkflow = useGenerateWorkflow()

  useEffect(() => {
    const t1 = setTimeout(() => setMounted(true), 50)
    const t2 = setInterval(() => setSuggIndex((i) => (i + 1) % PROMPT_SUGGESTIONS.length), 3200)
    return () => {
      clearTimeout(t1)
      clearInterval(t2)
    }
  }, [])

  useEffect(() => {
    const pageData = rulesPageQuery.data?.data ?? []
    if (!pageData.length) return
    setRuleOptions((prev) => {
      const base = rulesPage === 1 ? [] : prev
      const map = new Map(base.map((r) => [r.ruleId, r]))
      for (const item of pageData) map.set(item.ruleId, item)
      return Array.from(map.values())
    })
  }, [rulesPage, rulesPageQuery.data?.data])

  useEffect(() => {
    if (!selectedRuleId) return
    if (!ruleOptions.some((r) => r.ruleId === selectedRuleId)) {
      setSelectedRuleId(null)
    }
  }, [ruleOptions, selectedRuleId])

  async function handlePromptSubmit(text: string, attachments: Attachment[]) {
    const combined = buildStrategyInput(text, attachments)
    if (!combined.trim()) return
    setOrbPulse(true)

    const payload: { contentPrompt: string; ruleId?: string } = {
      contentPrompt: combined,
    }
    if (selectedRuleId) payload.ruleId = selectedRuleId

    generateWorkflow.mutate(payload, {
      onSuccess: (data) => {
        const { workflowId, ruleId } = data
        // Join the socket room NOW — before React re-renders for navigation —
        // so no events are missed while WorkflowPage is mounting.
        joinWorkflowRoom(workflowId)
        const ruleName = ruleOptions.find((r) => r.ruleId === ruleId)?.name
        navigate(`/workflow/${ruleId}`, { state: { generating: true, ruleName } })
      },
      onSettled: () => {
        setOrbPulse(false)
      },
    })
  }

  function handleSelectRule(ruleId: string) {
    setSelectedRuleId(ruleId)
  }

  function handleViewMoreRules() {
    const meta = rulesPageQuery.data?.meta
    if (!meta) return
    if (rulesPage >= meta.totalPages) return
    setRulesPage((p) => p + 1)
  }

  return (
    <div
      className="relative flex min-h-screen flex-col overflow-hidden"
      style={{ background: T.canvasBg, fontFamily: "'Inter Variable', Inter, sans-serif" }}
    >
      <HomeBackdrop />
      <HomeUserStrip />

      <div className="flex min-h-0 flex-1 flex-col items-center">
        <HomeStage
          mounted={mounted}
          orbPulse={orbPulse}
          hovLeft={hovLeft}
          hovRight={hovRight}
          setHovLeft={setHovLeft}
          setHovRight={setHovRight}
          onNavigateTemplates={() => navigate("/rules")}
          onNavigateRecent={() => navigate("/content")}
        >
          <HomePromptBar
            prompt={prompt}
            placeholder={focused ? "Describe what you want to create today…" : PROMPT_SUGGESTIONS[suggIndex]}
            onPromptChange={setPrompt}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onSubmit={handlePromptSubmit}
          />
          <HomeHelperLinks
            rules={ruleOptions}
            selectedRuleLabel={
              selectedRuleId
                ? ruleOptions.find((r) => r.ruleId === selectedRuleId)?.name
                : undefined
            }
            isLoadingRules={rulesPageQuery.isLoading && rulesPage === 1}
            isLoadingMore={rulesPageQuery.isFetching && rulesPage > 1}
            canViewMore={(rulesPageQuery.data?.meta.totalPages ?? 1) > rulesPage}
            onNavigateSetup={() => navigate("/rules")}
            onSelectRule={handleSelectRule}
            onViewMore={handleViewMoreRules}
          />
        </HomeStage>
      </div>

      <HomeFooter />

      {generateWorkflow.isPending ? (
        <div className="pointer-events-none fixed right-6 bottom-6 rounded-full bg-black/80 px-4 py-2 text-xs text-white">
          Generating workflow…
        </div>
      ) : null}
    </div>
  )
}
