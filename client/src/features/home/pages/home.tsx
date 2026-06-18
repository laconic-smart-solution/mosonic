import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"

import { HomeBackdrop } from "@/features/home/components/home-backdrop"
import { HomeFooter } from "@/features/home/components/home-footer"
import { HomeHelperLinks } from "@/features/home/components/home-helper-links"
import type { Attachment } from "@/components/core/prompt-area"
import { buildStrategyInput } from "@/lib/strategy-input"
import { HomePromptBar } from "@/features/home/components/home-prompt-bar"
import { HomeStage } from "@/features/home/components/home-stage"
import { HomeUserStrip } from "@/features/home/components/home-user-strip"
import {
  HOME_TEMPLATE_DEFS,
  PROMPT_SUGGESTION_KEYS,
} from "@/features/home/data/home-constants"
import { buildHomeRecentSlots } from "@/features/home/lib/home-recent-slots"
import { WorkflowQaWizard } from "@/features/workflow/components/workflow-qa-wizard/workflow-qa-wizard"
import type { WorkflowQAAnswers } from "@/features/workflow/types/workflow-qa.type"
import { useContentPageQuery } from "@/shared/queries/content.query"
import { useRulesPageQuery } from "@/shared/queries/rule.query"
import { useGenerateWorkflow } from "@/shared/queries/workflow.query"
import { useSessionBootstrap } from "@/shared/hooks/use-session-bootstrap"
import type { RuleListItem } from "@/shared/services/rule.service"
import { joinWorkflowRoom } from "@/shared/socket/workflow-events"
import { ruleChannelNamesToIds } from "@/shared/constants/distribution-channels"

export default function HomePage() {
  const { t } = useTranslation("home")
  const navigate = useNavigate()
  const homeTemplates = useMemo(
    () =>
      HOME_TEMPLATE_DEFS.map((def) => ({
        ...def,
        label: t(`templates.${def.id}.label`),
        sub: t(`templates.${def.id}.sub`),
      })),
    [t],
  )
  useSessionBootstrap()
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
  const [qaWizardOpen, setQaWizardOpen] = useState(false)
  const [qaInitialMessage, setQaInitialMessage] = useState("")

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

  const recentContentsQuery = useContentPageQuery(
    {
      page: 1,
      limit: 3,
      sortBy: "updatedAt",
      sortOrder: "desc",
    },
    true,
  )

  const recentSlots = useMemo(
    () => buildHomeRecentSlots(recentContentsQuery.data?.data ?? []),
    [recentContentsQuery.data?.data],
  )

  const generateWorkflow = useGenerateWorkflow()

  const selectedRuleChannelIds = useMemo(() => {
    const rule = ruleOptions.find((r) => r.ruleId === selectedRuleId)
    if (!rule?.channels?.length) return []
    return ruleChannelNamesToIds(
      rule.channels.map((channel) => ({ channel })),
    )
  }, [ruleOptions, selectedRuleId])

  useEffect(() => {
    const t1 = setTimeout(() => setMounted(true), 50)
    const t2 = setInterval(
      () => setSuggIndex((i) => (i + 1) % PROMPT_SUGGESTION_KEYS.length),
      3200,
    )
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

  function handlePromptSubmit(text: string, attachments: Attachment[]) {
    const combined = buildStrategyInput(text, attachments)
    if (!selectedRuleId) {
      toast.error(t("toast.selectRuleFirst"))
      return
    }
    setQaInitialMessage(combined.trim())
    setQaWizardOpen(true)
  }

  function handleQaSubmit(answers: WorkflowQAAnswers) {
    if (!selectedRuleId) return
    setOrbPulse(true)
    setQaWizardOpen(false)

    generateWorkflow.mutate(
      { ruleId: selectedRuleId, answers },
      {
        onSuccess: (data) => {
          const { workflowId, ruleId } = data
          joinWorkflowRoom(workflowId)
          const ruleName = ruleOptions.find((r) => r.ruleId === ruleId)?.name
          navigate(`/workflow/${ruleId}`, {
            state: {
              generating: true,
              ruleName,
              contentPrompt: answers.additionalMessage.trim(),
            },
          })
        },
        onSettled: () => {
          setOrbPulse(false)
        },
      },
    )
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
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-background font-sans">
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
          templates={homeTemplates}
          onNavigateTemplate={(path) => navigate(path)}
          recentSlots={recentSlots}
          isRecentLoading={recentContentsQuery.isLoading}
          onOpenRecentContent={(contentId, uid) =>
            navigate(uid ? `/upload/${uid}` : `/content/${contentId}`)
          }
          onOpenRecentLibrary={() => navigate("/content")}
        >
          <HomePromptBar
            prompt={prompt}
            placeholder={
              focused ? t("prompt.focusedPlaceholder") : t(PROMPT_SUGGESTION_KEYS[suggIndex])
            }
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

      <WorkflowQaWizard
        open={qaWizardOpen}
        onOpenChange={setQaWizardOpen}
        ruleChannelIds={selectedRuleChannelIds}
        initialMessage={qaInitialMessage}
        isSubmitting={generateWorkflow.isPending}
        onSubmit={handleQaSubmit}
      />
    </div>
  )
}
