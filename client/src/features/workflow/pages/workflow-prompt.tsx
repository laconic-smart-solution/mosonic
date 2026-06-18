import { useState, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { useLocation, useNavigate } from "react-router-dom"
import { FileText } from "lucide-react"
import { PromptArea, type Attachment } from "@/components/core/prompt-area"
import {
  useGenerateWorkflow,
  useGetWorkflowByRuleIdQuery,
} from "@/shared/queries/workflow.query"
import { useRuleByIdQuery } from "@/shared/queries/rule.query"
import type { RuleEntity } from "@/features/rules/data/rules-mock"
import { ruleChannelNamesToIds } from "@/shared/constants/distribution-channels"
import { WorkflowQaWizard } from "@/features/workflow/components/workflow-qa-wizard/workflow-qa-wizard"
import type { WorkflowQAAnswers } from "@/features/workflow/types/workflow-qa.type"
import { toast } from "sonner"
import { joinWorkflowRoom } from "@/shared/socket/workflow-events"
import { T } from "@/lib/tokens"
import { HomeBackdrop } from "@/features/home/components/home-backdrop"
import WorkflowExistingBanner from "../components/workflow-existing-banner"
import WorkflowFloatingNavigation from "../components/workflow-floating-navigation"

type RouteState = {
  ruleId?: string
  ruleName?: string
}

export default function WorkflowPromptPage() {
  const { t } = useTranslation("workflow")
  const navigate = useNavigate()
  const location = useLocation()
  const { ruleId, ruleName } = (location.state ?? {}) as RouteState

  const [prompt, setPrompt] = useState("")
  const [qaWizardOpen, setQaWizardOpen] = useState(false)

  const generateWorkflow = useGenerateWorkflow()

  // Check if a workflow already exists for this rule
  const existingWorkflowQuery = useGetWorkflowByRuleIdQuery(ruleId)
  const ruleQuery = useRuleByIdQuery<RuleEntity>(ruleId)
  const ruleChannelIds = useMemo(
    () => ruleChannelNamesToIds(ruleQuery.data?.channels),
    [ruleQuery.data?.channels],
  )
  const existingWorkflow = existingWorkflowQuery.data

  // If an existing ready workflow is found, offer to navigate to it
  const existingWorkflowId =
    existingWorkflow?.workflow?.status === "ready"
      ? existingWorkflow.workflow.workflowId
      : undefined

  // If still loading initial data, wait silently
  const isCheckingExisting = !!ruleId && existingWorkflowQuery.isLoading

  function handleSubmit(text: string, _attachments: Attachment[]) {
    if (!ruleId) {
      toast.error(t("toasts.selectRule", { defaultValue: "Select a rule first." }))
      return
    }
    setPrompt(text)
    setQaWizardOpen(true)
  }

  function handleQaSubmit(answers: WorkflowQAAnswers) {
    if (!ruleId) return
    setQaWizardOpen(false)
    generateWorkflow.mutate(
      { ruleId, answers },
      {
        onSuccess: (data) => {
          const { workflowId } = data
          joinWorkflowRoom(workflowId)
          navigate(`/workflow/${ruleId}`, {
            state: {
              generating: true,
              ruleName,
              contentPrompt: answers.additionalMessage.trim(),
            },
          })
        },
      },
    )
  }

  function goToExisting() {
    if (!existingWorkflowId) return
    if (ruleId) navigate(`/workflow/${ruleId}`)
  }

  function goToRuleSetup() {
    navigate("/rules")
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col items-center justify-center gap-8 px-4"
      style={{
        background: T.canvasBg,
        fontFamily: "'Inter Variable', Inter, sans-serif",
      }}
    >
      {/* Rule badge */}
      <HomeBackdrop />
      <WorkflowFloatingNavigation
        onBackToRuleSetup={goToRuleSetup}
        onOpenExistingWorkflow={goToExisting}
        hasExistingWorkflow={!!existingWorkflowId}
      />
      {ruleId && (
        <div
          className="flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm"
          style={{
            borderColor: T.accentBorder,
            background: T.accentLight,
            color: T.accent,
          }}
        >
          <FileText className="h-3.5 w-3.5 shrink-0" />
          <span className="font-medium">
            {ruleName ?? t("promptPage.selectedRule")}
          </span>
        </div>
      )}

      <div className="w-full max-w-[620px] space-y-3">
        <h1
          className="text-center text-2xl font-bold"
          style={{ color: T.textPrimary }}
        >
          {t("promptPage.title")}
        </h1>
        <p className="text-center text-sm" style={{ color: T.textSecondary }}>
          {t("promptPage.subtitle")}
        </p>

        <PromptArea
          value={prompt}
          onChange={setPrompt}
          placeholder={t("promptPage.placeholder")}
          onSubmit={handleSubmit}
          className="shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
        />

        {generateWorkflow.isPending && (
          <p className="text-center text-xs" style={{ color: T.textSecondary }}>
            {t("promptPage.generating")}
          </p>
        )}
      </div>

      {!isCheckingExisting && existingWorkflowId && (
        <WorkflowExistingBanner onOpenExisting={goToExisting} />
      )}

      <WorkflowQaWizard
        open={qaWizardOpen}
        onOpenChange={setQaWizardOpen}
        ruleChannelIds={ruleChannelIds}
        initialMessage={prompt.trim()}
        isSubmitting={generateWorkflow.isPending}
        onSubmit={handleQaSubmit}
      />
    </div>
  )
}
