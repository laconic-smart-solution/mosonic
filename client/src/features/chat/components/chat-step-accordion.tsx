import type { ReactNode } from "react"
import type { TFunction } from "i18next"
import { useTranslation } from "react-i18next"
import {
  ArrowUpRight,
  Check,
  Circle,
  Loader2,
  Link2,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react"
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
import { planAskedLines, sanitizePlanLine, type AskUserPlan } from "../lib/parse-ask-user"
import { parseContentCard } from "../lib/parse-content-card"
import { parsePipelineCard } from "../lib/parse-pipeline-card"
import { parseStartOauth, parseStartRednoteQr } from "../lib/parse-start-oauth"
import { parseWorkflowCard } from "../lib/parse-workflow-card"
import { dropSkippedSteps, normalizeAgentSteps } from "../lib/normalize-agent-steps"
import { deriveStepTrace, type TraceDoingItem } from "../lib/derive-step-trace"
import { ChatContentCard } from "./chat-content-card"
import { ChatPipelineCard } from "./chat-pipeline-card"
import { ChatWorkflowCard } from "./chat-workflow-card"

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
    // ignore
  }
  return null
}

function PlanBlock({ plan }: { plan: AskUserPlan }) {
  const { t } = useTranslation("chat")
  const asked = planAskedLines(plan)
  const will = plan.willChange.map(sanitizePlanLine).filter(Boolean)
  const gaps = plan.notPossible.map(sanitizePlanLine).filter(Boolean)
  if (!asked.length && !will.length && !gaps.length) {
    return <p className="text-[12.5px] text-[#718096] dark:text-[#9AA3B5]">{t("stepTrace.planEmpty")}</p>
  }
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {asked.length ? (
        <div className="rounded-xl border border-[#EDE9E1] bg-[#FBF9F6] px-3 py-2.5 dark:border-[#243044] dark:bg-[#0B1220]">
          <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.07em] text-[#4A5568] dark:text-[#9AA3B5]">
            {t("askUser.plan.asked")}
          </h4>
          <ul className="list-disc space-y-0.5 pl-4 text-[13px] leading-relaxed text-[#090C11] dark:text-[#F3F1EC]">
            {asked.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {will.length ? (
        <div className="rounded-xl border border-[#B5EFE3] bg-[#E0FAF5] px-3 py-2.5 dark:border-[#00A589]/40 dark:bg-[#0E2A26]">
          <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.07em] text-[#00A589] dark:text-[#00C9A7]">
            {t("askUser.plan.willChange")}
          </h4>
          <ul className="list-disc space-y-0.5 pl-4 text-[13px] leading-relaxed text-[#090C11] dark:text-[#F3F1EC]">
            {will.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {gaps.length ? (
        <div className="col-span-full flex gap-2 rounded-xl border border-[#F5D9A6] bg-[#FEF6E4] px-3 py-2.5 text-[13px] leading-relaxed text-[#090C11] dark:border-[#F5A623]/40 dark:bg-[#2A2110] dark:text-[#F3F1EC]">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[#A86C09] dark:text-[#F5A623]" aria-hidden />
          <div>
            <b className="text-[#A86C09] dark:text-[#F5A623]">{t("askUser.plan.notPossibleYet")}:</b> {gaps.join(" ")}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function DoingRow({ item }: { item: TraceDoingItem }) {
  const { t } = useTranslation("chat")
  const label = item.labelKey
    ? t(item.labelKey, { defaultValue: item.labelFallback, ...(item.labelParams ?? {}) })
    : item.labelFallback
  const detail =
    item.status === "failed" && item.detail
      ? toolErrorLabel(t, item.detail)
      : item.status === "waiting"
        ? t("askUser.waiting")
        : item.status === "pending" && item.detail
          ? item.detail
          : null

  const icon =
    item.status === "done" ? (
      <Check className="size-3.5 text-teal-500" aria-hidden />
    ) : item.status === "failed" ? (
      <X className="size-3.5 text-amber-600 dark:text-amber-400" aria-hidden />
    ) : item.status === "running" ? (
      <Loader2 className="size-3.5 animate-spin text-navy-500 dark:text-teal-400" aria-hidden />
    ) : item.status === "waiting" ? (
      <Circle className="size-3.5 fill-amber-400 text-amber-400" aria-hidden />
    ) : (
      <Circle className="size-3.5 text-[#D9D3C7] dark:text-[#243044]" aria-hidden />
    )

  return (
    <div className="flex items-start gap-2.5 py-2">
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-navy-50 dark:bg-white/8">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-[#090C11] dark:text-[#F3F1EC]">{label}</p>
        {detail ? (
          <p className="mt-0.5 text-[11.5px] text-amber-700 dark:text-amber-300">{detail}</p>
        ) : null}
        {item.toolName ? (
          <p className="mt-0.5 font-mono text-[10px] text-[#718096] dark:text-[#9AA3B5]">{item.toolName}</p>
        ) : null}
      </div>
    </div>
  )
}

/** Streaming-only extras: upload / OAuth chips / cards while the turn is still open. */
function StreamingExtras({
  steps,
  onRequestUpload,
  onStartRednoteQr,
}: {
  steps: AgentStep[]
  onRequestUpload?: () => void
  onStartRednoteQr?: (socketRoom: string) => void
}) {
  const { t } = useTranslation("chat")
  const normalized = dropSkippedSteps(normalizeAgentSteps(steps))
  const nodes: ReactNode[] = []

  normalized.forEach((step, index) => {
    if (step.type !== "observation") return
    const uploadRequest = parseUploadRequest(step.result)
    if (uploadRequest) {
      nodes.push(
        <div key={`up-${index}`} className="py-1.5">
          <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={onRequestUpload}>
            <Upload data-icon="inline-start" />
            {t("stepTrace.uploadAction", { assetType: t(`stepTrace.assetType.${uploadRequest.assetType}`) })}
          </Button>
        </div>,
      )
      return
    }
    const oauth = parseStartOauth(step.result)
    if (oauth) {
      nodes.push(
        <div key={`oa-${index}`} className="py-1.5">
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
        </div>,
      )
      return
    }
    const rednoteQr = parseStartRednoteQr(step.result)
    if (rednoteQr) {
      nodes.push(
        <div key={`rn-${index}`} className="py-1.5">
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
        </div>,
      )
      return
    }
    const workflowCard = parseWorkflowCard(step.result)
    if (workflowCard) {
      nodes.push(
        <div key={`wf-${index}`} className="py-1.5">
          <ChatWorkflowCard snapshot={workflowCard} />
        </div>,
      )
      return
    }
    const contentCard = parseContentCard(step.result)
    if (contentCard) {
      nodes.push(
        <div key={`ct-${index}`} className="py-1.5">
          <ChatContentCard snapshot={contentCard} />
        </div>,
      )
      return
    }
    const pipelineCard = parsePipelineCard(step.result)
    if (pipelineCard) {
      nodes.push(
        <div key={`pl-${index}`} className="py-1.5">
          <ChatPipelineCard snapshot={pipelineCard} />
        </div>,
      )
    }
  })

  if (!nodes.length) return null
  return <div className="border-t border-[#EDE9E1] dark:border-[#243044] px-1 pt-1">{nodes}</div>
}

function summaryLabel(
  t: TFunction<"chat">,
  phase: "working" | "waiting" | "done" | "failed",
  doneCount: number,
  totalCount: number,
): string {
  if (phase === "waiting") return t("stepTrace.summaryWaiting", { done: doneCount, total: totalCount })
  if (phase === "failed") return t("stepTrace.summaryFailed", { done: doneCount, total: totalCount })
  if (phase === "done") return t("stepTrace.summaryDone", { done: doneCount, total: totalCount })
  return t("stepTrace.summaryWorking", { done: doneCount, total: totalCount })
}

/**
 * Plan / Thinking / Doing accordion over assistant message steps.
 * Collapsed by default; expands to three nested sections.
 */
export function ChatStepAccordion({
  steps,
  onRequestUpload,
  onStartRednoteQr,
  embedCards = true,
  defaultOpen,
}: {
  steps: AgentStep[]
  onRequestUpload?: () => void
  onStartRednoteQr?: (socketRoom: string) => void
  embedCards?: boolean
  /** DEV preview can force open. */
  defaultOpen?: boolean
}) {
  const { t } = useTranslation("chat")
  const trace = deriveStepTrace(steps)
  if (!trace) return null

  const { plan, thinking, doing, doneCount, totalCount, phase } = trace
  const showPlan = !!plan
  const showThinking = thinking.length > 0
  const title = summaryLabel(t, phase, doneCount, totalCount)
  const nestedDefault = showThinking ? ["thinking"] : showPlan ? ["plan"] : ["doing"]

  return (
    <Accordion
      defaultValue={defaultOpen ? ["trace"] : []}
      className="w-full min-w-0 overflow-hidden rounded-[14px] border border-[#EDE9E1] bg-white dark:border-[#243044] dark:bg-[#121A2B]"
    >
      <AccordionItem value="trace" className="border-0 data-open:bg-transparent">
        <AccordionTrigger className="min-w-0 px-3 py-2.5 text-xs font-medium text-[#090C11] hover:no-underline dark:text-[#F3F1EC]">
          <span className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
            {phase === "failed" ? (
              <TriangleAlert className="size-3.5 shrink-0 text-amber-500" aria-hidden />
            ) : phase === "waiting" ? (
              <Circle className="size-3.5 shrink-0 fill-amber-400 text-amber-400" aria-hidden />
            ) : phase === "working" ? (
              <Loader2 className="size-3.5 shrink-0 animate-spin text-navy-500 dark:text-teal-400" aria-hidden />
            ) : (
              <Check className="size-3.5 shrink-0 text-teal-500" aria-hidden />
            )}
            <span className="min-w-0 truncate">{title}</span>
          </span>
        </AccordionTrigger>
        <AccordionContent className="h-auto border-t border-[#EDE9E1] px-0 dark:border-[#243044]">
          <Accordion multiple defaultValue={nestedDefault} className="rounded-none border-0 bg-transparent">
            {showPlan ? (
              <AccordionItem value="plan" className="border-[#EDE9E1] dark:border-[#243044]">
                <AccordionTrigger className="px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-[#4A5568] hover:no-underline dark:text-[#9AA3B5]">
                  {t("stepTrace.sectionPlan")}
                </AccordionTrigger>
                <AccordionContent className="h-auto px-3 pb-3">
                  <PlanBlock plan={plan!} />
                </AccordionContent>
              </AccordionItem>
            ) : null}

            {showThinking ? (
              <AccordionItem value="thinking" className="border-[#EDE9E1] dark:border-[#243044]">
                <AccordionTrigger className="px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-[#4A5568] hover:no-underline dark:text-[#9AA3B5]">
                  {t("stepTrace.sectionThinking")}
                </AccordionTrigger>
                <AccordionContent className="h-auto px-3 pb-3">
                  <ul className="space-y-1.5">
                    {thinking.map((line) => (
                      <li
                        key={line.text}
                        className="rounded-lg border border-[#EDE9E1] bg-[#FBF9F6] px-2.5 py-2 text-[13px] leading-relaxed text-[#090C11] dark:border-[#243044] dark:bg-[#0B1220] dark:text-[#F3F1EC]"
                      >
                        {line.text}
                      </li>
                    ))}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            ) : null}

            <AccordionItem value="doing" className="border-0">
              <AccordionTrigger className="px-3 py-2 text-[12px] font-semibold uppercase tracking-[0.06em] text-[#4A5568] hover:no-underline dark:text-[#9AA3B5]">
                {t("stepTrace.sectionDoing")}
              </AccordionTrigger>
              <AccordionContent className="h-auto px-3 pb-2">
                <div className="divide-y divide-[#EDE9E1]/70 dark:divide-[#243044]">
                  {doing.map((item) => (
                    <DoingRow key={item.id} item={item} />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          {embedCards ? (
            <StreamingExtras steps={steps} onRequestUpload={onRequestUpload} onStartRednoteQr={onStartRednoteQr} />
          ) : null}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}

