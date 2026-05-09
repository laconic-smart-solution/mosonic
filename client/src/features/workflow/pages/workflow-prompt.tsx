import { useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { FileText } from "lucide-react"
import { PromptArea, type Attachment } from "@/components/core/prompt-area"
import {
  useGenerateWorkflow,
  useGetWorkflowByRuleIdQuery,
} from "@/shared/queries/workflow.query"
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
  const navigate = useNavigate()
  const location = useLocation()
  const { ruleId, ruleName } = (location.state ?? {}) as RouteState

  const [prompt, setPrompt] = useState("")

  const generateWorkflow = useGenerateWorkflow()

  // Check if a workflow already exists for this rule
  const existingWorkflowQuery = useGetWorkflowByRuleIdQuery(ruleId)
  const existingWorkflow = existingWorkflowQuery.data

  // If an existing ready workflow is found, offer to navigate to it
  const existingWorkflowId =
    existingWorkflow?.workflow?.status === "ready"
      ? existingWorkflow.workflow.workflowId
      : undefined

  // If still loading initial data, wait silently
  const isCheckingExisting = !!ruleId && existingWorkflowQuery.isLoading

  function handleSubmit(text: string, _attachments: Attachment[]) {
    const contentPrompt = text.trim()
    if (!contentPrompt) return

    generateWorkflow.mutate(
      { contentPrompt, ruleId },
      {
        onSuccess: (data) => {
          const { workflowId } = data
          joinWorkflowRoom(workflowId)
          navigate(ruleId ? `/workflow/${ruleId}` : "/rules", { state: { generating: true, ruleName } })
        },
      }
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
          <span className="font-medium">{ruleName ?? "Selected rule"}</span>
        </div>
      )}

      <div className="w-full max-w-[620px] space-y-3">
        <h1
          className="text-center text-2xl font-bold"
          style={{ color: T.textPrimary }}
        >
          What would you like to create?
        </h1>
        <p className="text-center text-sm" style={{ color: T.textSecondary }}>
          Describe the content you want to produce and we'll build the right
          workflow for it.
        </p>

        <PromptArea
          value={prompt}
          onChange={setPrompt}
          placeholder="e.g. A launch post for our new product targeting young professionals…"
          onSubmit={handleSubmit}
          className="shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
        />

        {generateWorkflow.isPending && (
          <p className="text-center text-xs" style={{ color: T.textSecondary }}>
            Generating workflow…
          </p>
        )}
      </div>

      {!isCheckingExisting && existingWorkflowId && (
        <WorkflowExistingBanner onOpenExisting={goToExisting} />
      )}
    </div>
  )
}
