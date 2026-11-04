import type { TFunction } from "i18next"
import { useTranslation } from "react-i18next"
import { ArrowUpRight, Check, Link2, Search, TriangleAlert, Upload } from "lucide-react"
import { Link } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { buttonVariants } from "@/lib/button-variants"
import { cn } from "@/lib/utils"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import type { AgentStep } from "@/shared/services/chat.service"
import { parseAskUserPrompt } from "../lib/parse-ask-user"
import { parseContentCard } from "../lib/parse-content-card"
import { parsePipelineCard } from "../lib/parse-pipeline-card"
import { parseStartOauth, parseStartRednoteQr } from "../lib/parse-start-oauth"
import { parseWorkflowCard } from "../lib/parse-workflow-card"
import { dropSkippedSteps, normalizeAgentSteps } from "../lib/normalize-agent-steps"
import { isSilentToolCode, parseToolError } from "../lib/parse-tool-error"
import { TOOL_ICON, TOOL_LABEL_KEY } from "../lib/tool-call-labels"
import {
  pendingNodeTypeFromResult,
  rerunToolIcon,
  rerunToolLabelKey,
} from "../lib/rerun-node-label"
import { ChatContentCard } from "./chat-content-card"
import { ChatPipelineCard } from "./chat-pipeline-card"
import { ChatWorkflowCard } from "./chat-workflow-card"

function formatStepDuration(ms: number): string {
  if (ms < 1000) return "<1s"
  return `${Math.round(ms / 1000)}s`
}

/** One tool step: friendly label left, raw tool name right in mono gray. */
function ToolRow({ name, pendingNodeType }: { name: string; pendingNodeType?: string | null }) {
  const { t } = useTranslation("chat")
  const isRerun = name === "rerun_content_node"
  const Icon = isRerun ? rerunToolIcon(pendingNodeType) : (TOOL_ICON[name] ?? Search)
  const labelKey = isRerun ? rerunToolLabelKey(pendingNodeType) : TOOL_LABEL_KEY[name]
  return (
    <div className="flex items-center gap-2.5 py-2">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-navy-50 dark:bg-white/8 text-navy-500 dark:text-navy-200">
        <Icon className="size-3.5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1 truncate text-xs text-navy-700 dark:text-[#E8EDF6]">{labelKey ? t(labelKey) : t("stepTrace.genericStep")}</span>
    </div>
  )
}

function observationTypeForAction(
  steps: AgentStep[],
  actionIndex: number,
  action: Extract<AgentStep, { type: "action" }>,
): string | null {
  const id = action.toolCallId
  for (let i = actionIndex + 1; i < steps.length; i++) {
    const s = steps[i]
    if (s.type !== "observation") continue
    if (id ? s.toolCallId === id : s.name === action.name) {
      return pendingNodeTypeFromResult(s.result)
    }
  }
  return null
}

/**
 * Friendly label for a tool error code. Raw guard text (e.g. the
 * one-change-per-message instruction meant for the AI) is never shown.
 */
export function toolErrorLabel(t: TFunction<"chat">, code: string): string {
  return t(`dialogs.toolError.code.${code}`, { defaultValue: t("dialogs.toolError.code.generic") })
}

export function OpenCanvasButton({ path }: { path: string }) {
  const { t } = useTranslation("chat")
  return (
    <Link
      to={path}
      className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-6 gap-1 rounded-full px-2 text-[11px]")}
    >
      {t("workflowCard.openCanvasEdit")}
      <ArrowUpRight className="size-3" aria-hidden />
    </Link>
  )
}

type UploadRequestMarker = { action: "request_upload"; assetType: string }

function parseUploadRequest(result: string): UploadRequestMarker | null {
  try {
    const parsed: unknown = JSON.parse(result)
    if (
      parsed &&
      typeof parsed === "object" &&
      (parsed as { action?: unknown }).action === "request_upload" &&
      typeof (parsed as { assetType?: unknown }).assetType === "string"
    ) {
      return parsed as UploadRequestMarker
    }
  } catch {
    // not a marker â€” render as a normal observation below
  }
  return null
}

function StepBody({
  step,
  stepIndex,
  steps,
  onRequestUpload,
  onStartRednoteQr,
  embedCards,
}: {
  step: AgentStep
  stepIndex: number
  steps: AgentStep[]
  onRequestUpload?: () => void
  onStartRednoteQr?: (socketRoom: string) => void
  embedCards?: boolean
}) {
  const { t } = useTranslation("chat")

  // Private reasoning is never shown; the trigger line carries the total time.
  if (step.type === "thought") return null

  if (step.type === "action") {
    return (
      <ToolRow
        name={step.name}
        pendingNodeType={observationTypeForAction(steps, stepIndex, step)}
      />
    )
  }

  if (step.type === "observation") {
    const askUser = parseAskUserPrompt(step.result)
    if (askUser) {
      return (
        <div className="space-y-0.5 py-1.5">
          <p className="text-[11px] text-muted-foreground">{t("askUser.waiting")}</p>
        </div>
      )
    }

    const workflowCard = parseWorkflowCard(step.result)
    if (workflowCard) {
      return (
        <div className="space-y-1.5 py-1.5">
          {embedCards ? <ChatWorkflowCard snapshot={workflowCard} /> : null}
        </div>
      )
    }

    const contentCard = parseContentCard(step.result)
    if (contentCard) {
      return (
        <div className="space-y-1.5 py-1.5">
          {embedCards ? <ChatContentCard snapshot={contentCard} /> : null}
        </div>
      )
    }

    const pipelineCard = parsePipelineCard(step.result)
    if (pipelineCard) {
      return (
        <div className="space-y-1.5 py-1.5">
          {embedCards ? <ChatPipelineCard snapshot={pipelineCard} /> : null}
        </div>
      )
    }

    const uploadRequest = parseUploadRequest(step.result)
    if (uploadRequest) {
      return (
        <div className="space-y-1.5 py-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={onRequestUpload}
          >
            <Upload data-icon="inline-start" />
            {t("stepTrace.uploadAction", {
              assetType: t(`stepTrace.assetType.${uploadRequest.assetType}`),
            })}
          </Button>
        </div>
      )
    }

    const oauth = parseStartOauth(step.result)
    if (oauth) {
      // Finished messages render the chip under the bubble; only embed while streaming.
      if (!embedCards) return null
      return (
        <div className="space-y-1.5 py-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => {
              window.location.href = oauth.connectUrl
            }}
          >
            <Link2 data-icon="inline-start" />
            {t("stepTrace.connectAction", { platform: oauth.platform })}
          </Button>
        </div>
      )
    }

    const rednoteQr = parseStartRednoteQr(step.result)
    if (rednoteQr) {
      if (!embedCards) return null
      return (
        <div className="space-y-1.5 py-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => onStartRednoteQr?.(rednoteQr.socketRoom)}
          >
            <Link2 data-icon="inline-start" />
            {t("stepTrace.connectRednoteAction")}
          </Button>
        </div>
      )
    }

    const toolError = parseToolError(step.name, step.result)
    if (toolError) {
      return (
        <div className="flex flex-wrap items-center gap-1.5 py-1.5 pl-8 text-[11px] text-amber-700 dark:text-amber-300">
          <TriangleAlert className="size-3 shrink-0" aria-hidden />
          <span>{toolErrorLabel(t, toolError.code)}</span>
          {toolError.canvasPath ? <OpenCanvasButton path={toolError.canvasPath} /> : null}
        </div>
      )
    }

    // Plain observations stay out of the compact trace â€” the tool row already summarises the step.
    return null
  }

  return null
}

export function ChatStepAccordion({
  steps,
  onRequestUpload,
  onStartRednoteQr,
  embedCards,
}: {
  steps: AgentStep[]
  onRequestUpload?: () => void
  onStartRednoteQr?: (socketRoom: string) => void
  embedCards?: boolean
}) {
  const { t } = useTranslation("chat")
  const normalized = dropSkippedSteps(normalizeAgentSteps(steps))
  if (normalized.length === 0) return null

  const toolCount = normalized.filter((s) => s.type === "action").length
  // No tool ran: no step box at all, just the reply.
  if (toolCount === 0) return null
  const failedCount = normalized.filter((s) => {
    if (s.type !== "observation") return false
    const info = parseToolError(s.name, s.result)
    return !!info && !isSilentToolCode(info.code)
  }).length
  // One successful step: name it ("Saved your preference") instead of "Worked through 1 step".
  const onlyActionIndex = toolCount === 1 ? normalized.findIndex((s) => s.type === "action") : -1
  const onlyAction =
    onlyActionIndex >= 0 ? (normalized[onlyActionIndex] as Extract<AgentStep, { type: "action" }>) : undefined
  const singleLabel =
    onlyAction && failedCount === 0
      ? onlyAction.name === "remember"
        ? t("stepTrace.savedNote")
        : onlyAction.name === "rerun_content_node"
          ? t(rerunToolLabelKey(observationTypeForAction(normalized, onlyActionIndex, onlyAction)))
          : TOOL_LABEL_KEY[onlyAction.name]
            ? t(TOOL_LABEL_KEY[onlyAction.name])
            : null
      : null
  const totalMs = normalized.reduce(
    (sum, s) => sum + (s.type === "thought" && s.durationMs ? s.durationMs : 0),
    0,
  )

  return (
    <Accordion defaultValue={[]} className="w-full min-w-0 overflow-hidden rounded-[14px] border border-canvas-200 dark:border-white/8 bg-white dark:bg-navy-700">
      <AccordionItem value="steps">
        <AccordionTrigger className="min-w-0 px-3 py-2.5 text-xs font-medium text-navy-700 dark:text-[#E8EDF6] hover:no-underline">
          <span className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
            {failedCount > 0 ? (
              <TriangleAlert className="size-3.5 text-amber-500" aria-hidden />
            ) : (
              <Check className="size-3.5 text-teal-500" aria-hidden />
            )}
            {singleLabel ?? t("stepTrace.workedThrough", { count: toolCount })}
            {failedCount > 0 ? (
              <span className="font-normal text-amber-700 dark:text-amber-300">
                {t("stepTrace.failedSuffix", { count: failedCount })}
              </span>
            ) : null}
            {totalMs > 0 ? (
              <span className="ml-auto pr-2 font-normal text-canvas-600 dark:text-navy-200">
                {formatStepDuration(totalMs)}
              </span>
            ) : null}
          </span>
        </AccordionTrigger>
        <AccordionContent className="h-auto border-t border-canvas-200 dark:border-white/8 px-3">
          <div className="divide-y divide-canvas-200/70 dark:divide-white/8">
            {normalized.map((step, index) => (
              <StepBody
                key={index}
                step={step}
                stepIndex={index}
                steps={normalized}
                onRequestUpload={onRequestUpload}
                onStartRednoteQr={onStartRednoteQr}
                embedCards={embedCards}
              />
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
