import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { toastApiError } from "@/shared/lib/toast-error"
import { isInsufficientCredits } from "@/shared/lib/api-error"

import { GenerationCreditConfirmDialog } from "@/features/credit/components/generation-credit-confirm-dialog"
import { GenerationCreditHint } from "@/features/credit/components/generation-credit-hint"
import type { Attachment } from "@/components/core/prompt-area"
import { HomeHelperLinks } from "@/features/home/components/home-helper-links"
import { HomePromptBar } from "@/features/home/components/home-prompt-bar"
import { HomeStage } from "@/features/home/components/home-stage"
import {
  HOME_TEMPLATE_DEFS,
  PROMPT_SUGGESTION_KEYS,
} from "@/features/home/data/home-constants"
import { buildHomeRecentSlots } from "@/features/home/lib/home-recent-slots"
import {
  consumeHomePendingPrompt,
  saveHomePendingPrompt,
} from "@/features/home/lib/home-pending-prompt"
import { buildStrategyInput } from "@/lib/strategy-input"
import type { RuleIntakeAnswers } from "@/features/rules/types/rule-intake.type"
import { RuleExtractionProgress } from "@/features/rules/components/rule-extraction-progress"
import { CreateRuleWizard } from "@/features/rules/components/create-rule-wizard"
import type { RuleEntity } from "@/features/rules/data/rules-mock"
import { useRuleExtraction } from "@/features/rules/hooks/use-rule-extraction"
import { WorkflowQaWizard } from "@/features/workflow/components/workflow-qa-wizard/workflow-qa-wizard"
import type { WorkflowQAAnswers } from "@/features/workflow/types/workflow-qa.type"
import { useContentPageQuery } from "@/shared/queries/content.query"
import { useGenerationCreditCostsQuery } from "@/shared/queries/credit.query"
import { useRuleByIdQuery, useRulesPageQuery } from "@/shared/queries/rule.query"
import { useGenerateWorkflow } from "@/shared/queries/workflow.query"
import { useSessionBootstrap } from "@/shared/hooks/use-session-bootstrap"
import { useAuthStoreHydrated } from "@/shared/hooks/use-auth-store-hydrated"
import { useAuthStore } from "@/shared/stores/auth.store"
import type { RuleListItem } from "@/shared/services/rule.service"
import { joinWorkflowRoom } from "@/shared/socket/workflow-events"
import { ruleChannelNamesToIds } from "@/shared/constants/distribution-channels"

export default function HomePage() {
  const { t } = useTranslation("home")
  const navigate = useNavigate()
  const queryClient = useQueryClient()
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
  const authHydrated = useAuthStoreHydrated()
  const accessToken = useAuthStore((s) => s.accessToken)
  const isAuthenticated = authHydrated && Boolean(accessToken)
  const generationCostsQuery = useGenerationCreditCostsQuery(isAuthenticated)
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
  const [pendingRuleId, setPendingRuleId] = useState<string | null>(null)
  const [ruleWizardOpen, setRuleWizardOpen] = useState(false)
  const [ruleWizardPrompt, setRuleWizardPrompt] = useState("")
  const [ruleWizardKey, setRuleWizardKey] = useState(0)
  const [qaWizardOpen, setQaWizardOpen] = useState(false)
  const [qaInitialMessage, setQaInitialMessage] = useState("")
  const [workflowGenConfirmOpen, setWorkflowGenConfirmOpen] = useState(false)
  const pendingWorkflowAnswersRef = useRef<WorkflowQAAnswers | null>(null)
  const pendingWorkflowRuleIdRef = useRef<string | null>(null)

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
    isAuthenticated,
  )

  const recentContentsQuery = useContentPageQuery(
    {
      page: 1,
      limit: 3,
      sortBy: "updatedAt",
      sortOrder: "desc",
    },
    isAuthenticated,
  )

  const recentSlots = useMemo(
    () => buildHomeRecentSlots(recentContentsQuery.data?.data ?? []),
    [recentContentsQuery.data?.data],
  )

  const generateWorkflow = useGenerateWorkflow()

  const workflowRuleId = selectedRuleId ?? pendingRuleId

  const pendingRuleQuery = useRuleByIdQuery<RuleEntity>(
    pendingRuleId ?? undefined,
    Boolean(pendingRuleId && !selectedRuleId),
  )

  const handleExtractCompleted = useCallback(
    async (ruleId: string) => {
      setPendingRuleId(ruleId)
      await queryClient.invalidateQueries({ queryKey: ["rules", "pageable"] })
      await queryClient.invalidateQueries({ queryKey: ["rule", ruleId] })
    },
    [queryClient],
  )

  const handleExtractFailed = useCallback(
    (_ruleId: string, message: string) => {
      setOrbPulse(false)
      toast.error(message || t("toast.extractionFailed"))
    },
    [t],
  )

  const {
    processingRuleId,
    progressStep,
    failureMessage,
    streamedContent,
    showOverlay: showExtractionOverlay,
    isExtracting,
    runExtract,
    dismissFailure,
  } = useRuleExtraction({
    i18nNamespace: "home",
    showExtractionStartedToast: false,
    onCompleted: handleExtractCompleted,
    onFailed: handleExtractFailed,
  })

  const activeRuleChannelIds = useMemo(() => {
    if (selectedRuleId) {
      const rule = ruleOptions.find((r) => r.ruleId === selectedRuleId)
      if (!rule?.channels?.length) return []
      return ruleChannelNamesToIds(
        rule.channels.map((channel) => ({ channel })),
      )
    }
    if (pendingRuleId && pendingRuleQuery.data?.channels?.length) {
      return ruleChannelNamesToIds(pendingRuleQuery.data.channels)
    }
    return []
  }, [pendingRuleId, pendingRuleQuery.data?.channels, ruleOptions, selectedRuleId])

  useEffect(() => {
    if (!isAuthenticated) return
    const pendingPrompt = consumeHomePendingPrompt()
    if (pendingPrompt) {
      setPrompt(pendingPrompt)
    }
  }, [isAuthenticated])

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

  useEffect(() => {
    if (!pendingRuleId || selectedRuleId) return
    const rule = pendingRuleQuery.data
    if (!rule || rule.status === "processing") return

    const channelIds = ruleChannelNamesToIds(rule.channels ?? [])
    if (!channelIds.length) {
      toast.error(t("toast.noChannelsAfterExtract"))
      setPendingRuleId(null)
      setOrbPulse(false)
      return
    }

    setOrbPulse(false)
    setQaWizardOpen(true)
  }, [pendingRuleId, pendingRuleQuery.data, selectedRuleId, t])

  const promptBusy =
    isAuthenticated &&
    (isExtracting || generateWorkflow.isPending || Boolean(pendingRuleId))

  function navigateWithAuth(path: string) {
    if (isAuthenticated) {
      navigate(path)
      return
    }
    navigate("/login")
  }

  function handlePromptSubmit(text: string, attachments: Attachment[]) {
    const combined = buildStrategyInput(text, attachments)
    const trimmed = combined.trim()

    if (!isAuthenticated) {
      saveHomePendingPrompt(trimmed)
      navigate("/login")
      return
    }

    setQaInitialMessage(trimmed)

    if (selectedRuleId) {
      setQaWizardOpen(true)
      return
    }

    setRuleWizardPrompt(trimmed)
    setRuleWizardKey((k) => k + 1)
    setRuleWizardOpen(true)
  }

  function executeRuleGeneration(
    text: string,
    attachments: Attachment[],
    intake?: RuleIntakeAnswers,
  ) {
    setOrbPulse(true)
    void runExtract(text, attachments, intake)
  }

  function handleQaSubmit(answers: WorkflowQAAnswers) {
    const ruleId = workflowRuleId
    if (!ruleId) return
    pendingWorkflowAnswersRef.current = answers
    pendingWorkflowRuleIdRef.current = ruleId
    setQaWizardOpen(false)
    setWorkflowGenConfirmOpen(true)
  }

  function executeWorkflowGeneration(
    answers: WorkflowQAAnswers,
    ruleId: string,
  ) {
    if (!ruleId) return
    setOrbPulse(true)

    generateWorkflow.mutate(
      { ruleId, answers },
      {
        onSuccess: (data) => {
          const { workflowId, ruleId: resolvedRuleId } = data
          joinWorkflowRoom(workflowId)
          const ruleName =
            ruleOptions.find((r) => r.ruleId === resolvedRuleId)?.name ??
            pendingRuleQuery.data?.name
          pendingWorkflowRuleIdRef.current = null
          setPendingRuleId(null)
          navigate(`/workflow/${resolvedRuleId}`, {
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
        onError: (err) => {
          if (isInsufficientCredits(err)) {
            toastApiError(err, "credit:runConfirm.insufficientTitle")
            return
          }
          toastApiError(err, "workflow:errors.generateWorkflowFailed")
        },
      },
    )
  }

  function handleSelectRule(ruleId: string) {
    setSelectedRuleId(ruleId)
    setPendingRuleId(null)
  }

  function handleViewMoreRules() {
    const meta = rulesPageQuery.data?.meta
    if (!meta) return
    if (rulesPage >= meta.totalPages) return
    setRulesPage((p) => p + 1)
  }

  function handleDismissExtractionFailure() {
    dismissFailure()
    setOrbPulse(false)
    setPendingRuleId(null)
  }

  function handleExtractionTryAgain() {
    handleDismissExtractionFailure()
  }

  return (
    <div className="relative flex min-h-[100dvh] w-full flex-1 flex-col overflow-x-hidden bg-background pt-14">

      {isAuthenticated && showExtractionOverlay ? (
        <RuleExtractionProgress
          ruleId={processingRuleId ?? ""}
          progressStep={progressStep}
          failureMessage={failureMessage}
          streamedContent={streamedContent}
          translationNamespace="home"
          subtitle={t("prompt.extractingSubtitle")}
          onDismiss={failureMessage ? handleDismissExtractionFailure : undefined}
          onTryAgain={failureMessage ? handleExtractionTryAgain : undefined}
        />
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col items-center">
        <HomeStage
          mounted={mounted}
          orbPulse={orbPulse}
          hovLeft={hovLeft}
          hovRight={hovRight}
          setHovLeft={setHovLeft}
          setHovRight={setHovRight}
          templates={homeTemplates}
          onNavigateTemplate={navigateWithAuth}
          recentSlots={recentSlots}
          isRecentLoading={isAuthenticated && recentContentsQuery.isLoading}
          onOpenRecentContent={(contentId, uid) =>
            navigateWithAuth(uid ? `/upload/${uid}` : `/content/${contentId}`)
          }
        >
          <HomePromptBar
            prompt={prompt}
            placeholder={
              focused
                ? t("prompt.focusedPlaceholder")
                : promptBusy
                  ? t("prompt.generatingWorkflow")
                  : t(PROMPT_SUGGESTION_KEYS[suggIndex])
            }
            onPromptChange={setPrompt}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onSubmit={handlePromptSubmit}
            disabled={promptBusy}
            submitDisabled={promptBusy}
          />
          {isAuthenticated && !selectedRuleId ? (
            <GenerationCreditHint
              credits={generationCostsQuery.data?.ruleGeneration}
              className="mt-2"
            />
          ) : null}
          <HomeHelperLinks
            rules={ruleOptions}
            showRuleSelector={isAuthenticated}
            selectedRuleLabel={
              selectedRuleId
                ? ruleOptions.find((r) => r.ruleId === selectedRuleId)?.name
                : undefined
            }
            isLoadingRules={rulesPageQuery.isLoading && rulesPage === 1}
            isLoadingMore={rulesPageQuery.isFetching && rulesPage > 1}
            canViewMore={(rulesPageQuery.data?.meta.totalPages ?? 1) > rulesPage}
            onNavigateSetup={() => navigateWithAuth("/rules")}
            onSelectRule={handleSelectRule}
            onViewMore={handleViewMoreRules}
          />
        </HomeStage>
      </div>

      {isAuthenticated ? (
        <>
          <CreateRuleWizard
            open={ruleWizardOpen}
            onOpenChange={setRuleWizardOpen}
            initialPrompt={ruleWizardPrompt}
            onPromptChange={setRuleWizardPrompt}
            promptAreaKey={ruleWizardKey}
            onExtract={executeRuleGeneration}
            isExtracting={isExtracting}
          />

          <WorkflowQaWizard
            key={workflowRuleId ?? "none"}
            open={qaWizardOpen}
            onOpenChange={(open) => {
              setQaWizardOpen(open)
              if (!open && !pendingWorkflowAnswersRef.current) {
                setPendingRuleId(null)
                setOrbPulse(false)
              }
            }}
            ruleChannelIds={activeRuleChannelIds}
            initialMessage={qaInitialMessage}
            isSubmitting={generateWorkflow.isPending}
            onSubmit={handleQaSubmit}
          />

          <GenerationCreditConfirmDialog
            open={workflowGenConfirmOpen}
            onOpenChange={(open) => {
              setWorkflowGenConfirmOpen(open)
              if (!open) {
                pendingWorkflowAnswersRef.current = null
                pendingWorkflowRuleIdRef.current = null
                if (!selectedRuleId) {
                  setPendingRuleId(null)
                  setOrbPulse(false)
                }
              }
            }}
            kind="workflow"
            isSubmitting={generateWorkflow.isPending}
            onConfirm={() => {
              const answers = pendingWorkflowAnswersRef.current
              const ruleId =
                pendingWorkflowRuleIdRef.current ?? workflowRuleId
              if (!answers || !ruleId) return
              pendingWorkflowAnswersRef.current = null
              pendingWorkflowRuleIdRef.current = null
              setWorkflowGenConfirmOpen(false)
              executeWorkflowGeneration(answers, ruleId)
            }}
          />
        </>
      ) : null}
    </div>
  )
}
