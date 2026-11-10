import { useEffect, useMemo, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Star, X, TriangleAlert } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { toastApiError } from "@/shared/lib/toast-error"
import { useSaveWorkflowNodesMutation } from "@/shared/queries/workflow.query"
import { workflowService } from "@/shared/services/workflow.service"
import type { WorkflowNode } from "@/shared/types/workflow.type"
import type { AskUserPlan, AskUserPrompt, GenerationPreviewStep } from "../lib/parse-ask-user"
import { displayGenerationTitle, planAskedLines, sanitizePlanLine } from "../lib/parse-ask-user"

const CHANNEL_LABEL: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  tiktok: "TikTok",
  rednote: "RedNote",
}

const IMAGE_TYPES = ["website_mockup", "photo", "illustration", "watercolor"] as const
const MOODS = ["clean", "bold", "playful"] as const
const ASPECTS = [
  { value: "1:1", w: 20, h: 20 },
  { value: "4:5", w: 18, h: 22 },
  { value: "9:16", w: 13, h: 22 },
] as const

function channelName(id: string | null | undefined): string {
  if (!id) return ""
  return CHANNEL_LABEL[id] ?? id
}

function nodeLabel(step: GenerationPreviewStep, t: (k: string, o?: Record<string, unknown>) => string): string {
  const typeKey = `askUser.preview.nodeType.${step.type}`
  const typed = t(typeKey)
  const base = typed === typeKey ? step.type.replace(/_/g, " ") : typed
  if (!step.lane) return base
  if (step.type === "adapt") return t("askUser.preview.nodeType.adaptFor", { channel: channelName(step.lane) })
  if (step.type === "image_generation") return t("askUser.preview.nodeType.imageFor", { channel: channelName(step.lane) })
  return `${base} · ${channelName(step.lane)}`
}

function nodeBlurb(step: GenerationPreviewStep, t: (k: string, o?: Record<string, unknown>) => string): string {
  const key = `askUser.preview.nodeBlurb.${step.type}`
  const typed = t(key, { channel: channelName(step.lane) })
  return typed === key ? "" : typed
}

function channelChips(prompt: AskUserPrompt): string[] {
  if (prompt.gaps?.channels?.length) return prompt.gaps.channels
  if (prompt.preview?.lanes?.length) return prompt.preview.lanes.map((c) => CHANNEL_LABEL[c] ?? c)
  return []
}

function stepBadge(
  step: GenerationPreviewStep,
  gaps: AskUserPrompt["gaps"],
): "adding" | "updated" | undefined {
  if (step.badge === "adding" || step.badge === "updated") return step.badge
  const missing = new Set((gaps?.missingChannels ?? []).map((c) => c.toLowerCase()))
  if (step.lane && missing.has(channelName(step.lane).toLowerCase())) return "adding"
  if (step.lane && missing.has(step.lane.toLowerCase())) return "adding"
  if (step.issue) return "updated"
  return undefined
}

/** List-price defaults — mirrors server estimate-run-credits.util + billable defaults. */
const LIST_PRICE_USD: Record<string, number> = {
  keyword_planner: 0.01,
  intelligence: 0.01,
  text_generation: 0.01,
  adapt: 0.008,
  transcription: 0.006,
  summarization: 0.006,
  translation: 0.008,
  image_generation: 0.04,
  video_presenter: 0.501,
  video_cinematic: 0.48,
  video_generation_presenter: 0.501,
  video_generation_cinematic: 0.48,
}

function creditsFromRawCostUsd(rawCostUsd: number): number {
  // creditPriceUsd 0.01, marginTarget 3, overheadFactor 0
  if (!(rawCostUsd > 0)) return 0
  return Math.ceil((rawCostUsd * 3.0) / 0.01)
}

function estimateFromPreview(prompt: AskUserPrompt): {
  images: number
  credits: number
  basis: "list_price" | "unknown"
} {
  if (prompt.estimate && typeof prompt.estimate.credits === "number") {
    return {
      images: prompt.estimate.images,
      credits: prompt.estimate.credits,
      basis: prompt.estimate.basis === "list_price" ? "list_price" : "list_price",
    }
  }
  const steps = prompt.preview?.steps ?? []
  let images = 0
  let credits = 0
  for (const s of steps) {
    let key = s.type
    if (key === "video_presenter") key = "video_generation_presenter"
    if (key === "video_cinematic") key = "video_generation_cinematic"
    if (s.type === "image_generation") images += 1
    const usd = LIST_PRICE_USD[key]
    if (usd != null) credits += creditsFromRawCostUsd(usd)
  }
  return { images, credits, basis: credits > 0 ? "list_price" : "unknown" }
}

function Chip({
  label,
  on,
  onClick,
  disabled,
  readOnly,
}: {
  label: string
  on?: boolean
  onClick?: () => void
  disabled?: boolean
  /** Non-persisted: looks selected but is not interactive. */
  readOnly?: boolean
}) {
  const className = cn(
    "rounded-lg border px-2.5 py-1 text-[12.5px] font-medium",
    on
      ? "border-[#0F1F3D] bg-[#0F1F3D] text-white"
      : "border-[#D9D3C7] bg-white text-[#090C11] dark:border-[#243044] dark:bg-[#121A2B] dark:text-[#F3F1EC]",
    readOnly && "cursor-default opacity-70",
    !readOnly && !disabled && "transition-colors hover:border-[#254C94]",
    disabled && !readOnly && "opacity-50",
  )
  if (readOnly) {
    return (
      <span className={className} aria-disabled="true" title="View only — not saved yet">
        {label}
      </span>
    )
  }
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={className}>
      {label}
    </button>
  )
}

function ToggleRow({
  label,
  hint,
  on,
  onChange,
  disabled,
  readOnly,
}: {
  label: ReactNode
  hint?: string
  on: boolean
  onChange?: (v: boolean) => void
  disabled?: boolean
  /** Non-persisted: shows state, no click. */
  readOnly?: boolean
}) {
  const body = (
    <>
      <span className="min-w-0">
        <span className="block font-medium">{label}</span>
        {hint ? <span className="block text-[12px] font-normal text-[#718096]">{hint}</span> : null}
        {readOnly ? (
          <span className="mt-0.5 block text-[11px] font-medium text-[#718096]">View only — not saved yet</span>
        ) : null}
      </span>
      <span
        aria-hidden
        className={cn(
          "relative h-5 w-[34px] shrink-0 rounded-full",
          on ? "bg-[#00C9A7]" : "bg-[#D9D3C7]",
          readOnly && "opacity-60",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white",
            on ? "right-0.5" : "left-0.5",
          )}
        />
      </span>
    </>
  )
  if (readOnly) {
    return (
      <div
        className="flex w-full items-center justify-between gap-3 rounded-[10px] border border-dashed border-[#D9D3C7] bg-[#FBF9F6] px-2.5 py-2 text-left text-[13px] text-[#4A5568] dark:border-[#243044] dark:bg-[#0B1220] dark:text-[#9AA3B5]"
        aria-disabled="true"
      >
        {body}
      </div>
    )
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange?.(!on)}
      className="flex w-full items-center justify-between gap-3 rounded-[10px] border border-[#EDE9E1] px-2.5 py-2 text-left text-[13px] text-[#090C11]"
    >
      {body}
    </button>
  )
}

function Segmented({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: string; label: string }[]
  value: string
  onChange: (id: string) => void
}) {
  return (
    <div className="flex gap-0.5 rounded-[9px] bg-[#EDE9E1] p-[3px]">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={cn(
            "flex-1 rounded-[7px] px-2 py-1.5 text-center text-[12.5px] font-semibold transition-colors",
            value === tab.id
              ? "bg-white text-[#0F1F3D] shadow-sm"
              : "text-[#4A5568]",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

function PlanSummary({ plan }: { plan?: AskUserPlan | null }) {
  const { t } = useTranslation("chat")
  if (!plan) return null
  const asked = planAskedLines(plan)
  const will = plan.willChange.map(sanitizePlanLine).filter(Boolean)
  const gaps = plan.notPossible.map(sanitizePlanLine).filter(Boolean)
  if (!asked.length && !will.length && !gaps.length) return null
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      {asked.length ? (
        <div className="rounded-xl border border-[#EDE9E1] bg-[#FBF9F6] px-3 py-2.5 dark:border-[#243044] dark:bg-[#0B1220]">
          <h4 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-[#4A5568] dark:text-[#9AA3B5]">
            {t("askUser.plan.asked")}
          </h4>
          <ul className="list-disc space-y-0.5 pl-4 text-[13px] leading-relaxed text-[#090C11] dark:text-[#F3F1EC]">
            {asked.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div />
      )}
      {will.length ? (
        <div className="rounded-xl border border-[#B5EFE3] bg-[#E0FAF5] px-3 py-2.5 dark:border-[#00A589]/40 dark:bg-[#0E2A26]">
          <h4 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-[#00A589] dark:text-[#00C9A7]">
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
        <div className="col-span-full flex gap-2.5 rounded-xl border border-[#F5D9A6] bg-[#FEF6E4] px-3 py-2.5 text-[13px] leading-relaxed text-[#090C11] dark:border-[#F5A623]/40 dark:bg-[#2A2110] dark:text-[#F3F1EC]">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[#A86C09]" aria-hidden />
          <div>
            <b className="text-[#A86C09]">{t("askUser.plan.notPossibleYet")}:</b>{" "}
            {gaps.join(" ")}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Badge({ kind }: { kind: "adding" | "updated" }) {
  const { t } = useTranslation("chat")
  return (
    <span
      className={cn(
        "ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold",
        kind === "adding" ? "bg-[#E0FAF5] text-[#00A589]" : "bg-[#E8EDF6] text-[#254C94]",
      )}
    >
      {t(kind === "adding" ? "askUser.preview.badgeAdding" : "askUser.preview.badgeUpdated")}
    </span>
  )
}

type DraftMap = Record<string, Record<string, unknown>>

/**
 * Plan / run confirm card — matches Designer mocks (Review this plan).
 * Apply persists editable node settings via PUT /workflow/:id/nodes.
 * Display-only controls (image count, mood, mockup type, refs toggles) stay local.
 */
export function ChatGenerationPreview({
  prompt,
  disabled,
  onChoose,
  initialSelectedId,
}: {
  prompt: AskUserPrompt
  disabled?: boolean
  onChoose: (text: string) => void
  /** DEV/fixture: open on a specific step (e.g. Image · Facebook). */
  initialSelectedId?: string
}) {
  const { t } = useTranslation("chat")
  const queryClient = useQueryClient()
  const save = useSaveWorkflowNodesMutation()
  const preview = prompt.preview!
  const steps = useMemo(
    () => [...preview.steps].sort((a, b) => a.order - b.order),
    [preview.steps],
  )
  const [selectedId, setSelectedId] = useState(initialSelectedId && steps.some((s) => s.nodeId === initialSelectedId) ? initialSelectedId : (steps[0]?.nodeId ?? ""))
  const [drafts, setDrafts] = useState<DraftMap>({})
  const [tab, setTab] = useState("style")
  const selected = steps.find((s) => s.nodeId === selectedId) ?? steps[0]
  const workflowId = prompt.workflowId
  const estimate = estimateFromPreview(prompt)
  const channels = channelChips(prompt)
  const title = displayGenerationTitle(prompt)
  const summaryLine = [
    title,
    channels.length ? channels.join(", ") : null,
    t("askUser.preview.stepCount", { count: steps.length }),
    estimate.credits > 0 ? t("askUser.preview.creditsApprox", { count: estimate.credits }) : t("askUser.preview.footerCreditsWhenStart"),
  ]
    .filter(Boolean)
    .join(" · ")

  const workflowQuery = useQuery({
    queryKey: ["workflow", workflowId, "preview-card"],
    queryFn: () => workflowService.getById(workflowId!),
    enabled: !!workflowId,
    staleTime: 30_000,
  })

  useEffect(() => {
    if (!selected && steps[0]) setSelectedId(steps[0].nodeId)
  }, [selected, steps])

  useEffect(() => {
    // Reset tab when selecting a different step type family.
    if (!selected) return
    if (selected.type === "image_generation") setTab("style")
    else if (selected.type === "adapt" || selected.type === "text_generation") setTab("text")
    else setTab("basics")
  }, [selected?.nodeId, selected?.type])

  const fullNode: WorkflowNode | undefined = workflowQuery.data?.nodes.find((n) => n.nodeId === selected?.nodeId)
  const baseConfig = (fullNode?.config ?? selected?.settings ?? {}) as Record<string, unknown>
  const draftConfig = selected ? (drafts[selected.nodeId] ?? baseConfig) : {}

  function patchDraft(patch: Record<string, unknown>) {
    if (!selected) return
    setDrafts((prev) => ({
      ...prev,
      [selected.nodeId]: { ...(prev[selected.nodeId] ?? baseConfig), ...patch },
    }))
  }

  async function applyAllDirty(): Promise<boolean> {
    if (!workflowId || !workflowQuery.data) return true
    const dirtyIds = Object.keys(drafts)
    if (dirtyIds.length === 0) return true
    const nodes = workflowQuery.data.nodes.map((n) => {
      const next = drafts[n.nodeId]
      if (!next) return n
      // Persist only known backend keys.
      const live: Record<string, unknown> = {}
      for (const key of [
        "aspectRatio",
        "quality",
        "negativePrompt",
        "style",
        "designStyle",
        "tone",
        "textLength",
        "outputFormat",
        "customPrompt",
        "targetLanguage",
        "sourceLanguage",
        "formalityLevel",
      ]) {
        if (key in next) live[key] = next[key]
      }
      return { ...n, config: { ...(n.config ?? {}), ...live } }
    })
    try {
      await save.mutateAsync({
        workflowId,
        ruleId: workflowQuery.data.workflow.ruleRef || undefined,
        name: workflowQuery.data.workflow.name,
        nodes,
        edges: workflowQuery.data.edges,
      })
      await queryClient.invalidateQueries({ queryKey: ["workflow", workflowId, "preview-card"] })
      setDrafts({})
      return true
    } catch (err) {
      toastApiError(err, "workflow:toast.saveFailed")
      return false
    }
  }

  async function start() {
    const ok = await applyAllDirty()
    if (!ok) return
    const startOpt =
      prompt.options.find((o) => o.id === "start_post") ??
      prompt.options.find((o) => o.id === "yes")
    if (startOpt) onChoose(`User choice: ${startOpt.id} (${startOpt.label})`)
  }

  function pick(id: string) {
    const opt = prompt.options.find((o) => o.id === id)
    if (opt) onChoose(`User choice: ${opt.id} (${opt.label})`)
  }

  function dismiss() {
    const cancel = prompt.options.find((o) => o.id === "cancel" || o.id === "not_now" || o.id === "no")
    if (cancel) pick(cancel.id)
  }

  const badge = selected ? stepBadge(selected, prompt.gaps) : undefined
  const startLabel =
    estimate.credits > 0
      ? t("askUser.preview.startWithCredits", { count: estimate.credits })
      : t("askUser.preview.start")

  return (
    <div className="w-full min-w-0 overflow-hidden rounded-2xl border border-[#EDE9E1] bg-white shadow-[0_24px_48px_-12px_rgba(15,31,61,0.18)] dark:border-[#243044] dark:bg-[#121A2B] dark:shadow-[0_24px_48px_-12px_rgba(0,0,0,0.45)]">
      {/* Header */}
      <div className="flex items-start gap-3 px-5 pt-[18px]">
        <div className="grid size-[38px] shrink-0 place-items-center rounded-[11px] bg-[#FEF6E4] text-[#A86C09]">
          <Star className="size-[18px]" strokeWidth={1.9} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-[#090C11] dark:text-[#F3F1EC]">{t("askUser.preview.reviewTitle")}</p>
          <p className="mt-0.5 text-[13px] leading-snug text-[#4A5568] dark:text-[#9AA3B5]">{summaryLine}</p>
        </div>
        <button
          type="button"
          aria-label={t("askUser.preview.close")}
          className="text-[#718096] hover:text-[#090C11] dark:text-[#9AA3B5] dark:hover:text-[#F3F1EC]"
          disabled={disabled}
          onClick={dismiss}
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      <div className="flex flex-col gap-3 px-5 py-4">
        <PlanSummary plan={prompt.plan} />

        {/* Split: step list | config */}
        <div className="flex min-h-[280px] flex-col overflow-hidden rounded-xl border border-[#EDE9E1] dark:border-[#243044] md:flex-row">
          <div className="shrink-0 border-b border-[#EDE9E1] bg-[#FBF9F6] p-2 dark:border-[#243044] dark:bg-[#0B1220] md:w-[250px] md:border-b-0 md:border-r">
            <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-[#718096]">
              {t("askUser.preview.stepsRuns", { count: steps.length })}
            </div>
            <div className="flex gap-0.5 overflow-x-auto md:flex-col md:overflow-visible" role="tablist">
              {steps.map((step, i) => {
                const on = step.nodeId === selected?.nodeId
                const b = stepBadge(step, prompt.gaps)
                return (
                  <button
                    key={step.nodeId}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    disabled={disabled}
                    onClick={() => setSelectedId(step.nodeId)}
                    className={cn(
                      "mb-0.5 flex min-h-10 w-full min-w-[9.5rem] items-center gap-2 rounded-[9px] border px-2 py-2 text-left text-[13px] md:min-w-0",
                      on
                        ? "border-[#254C94] bg-white shadow-[inset_3px_0_0_#00C9A7]"
                        : "border-transparent text-[#090C11] hover:bg-white/70",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-5 shrink-0 place-items-center rounded-md text-[11px] font-semibold",
                        on ? "bg-[#0F1F3D] text-white" : "bg-[#EDE9E1] text-[#4A5568]",
                      )}
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">{nodeLabel(step, t)}</span>
                    {b ? <Badge kind={b} /> : null}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-3 p-3.5 sm:p-4">
            {selected ? (
              <>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-[#090C11] dark:text-[#F3F1EC]">{nodeLabel(selected, t)}</p>
                  {nodeBlurb(selected, t) ? (
                    <span className="text-[12px] font-normal text-[#718096]">{nodeBlurb(selected, t)}</span>
                  ) : null}
                  {badge ? <Badge kind={badge} /> : null}
                </div>

                {selected.type === "image_generation" ? (
                  <ImageStepConfig
                    tab={tab}
                    setTab={setTab}
                    config={draftConfig}
                    onPatch={patchDraft}
                    disabled={!!disabled || save.isPending}
                    t={t}
                    attachedCount={prompt.attachedImageCount ?? 0}
                    brandImageCount={prompt.brandImageCount ?? 0}
                  />
                ) : selected.type === "adapt" || selected.type === "text_generation" ? (
                  <AdaptStepConfig
                    tab={tab}
                    setTab={setTab}
                    config={draftConfig}
                    onPatch={patchDraft}
                    disabled={!!disabled || save.isPending}
                    t={t}
                  />
                ) : selected.type === "keyword_planner" ? (
                  <KeywordStepConfig
                    tab={tab}
                    setTab={setTab}
                    config={draftConfig}
                    topic={prompt.topic ?? title}
                    onPatch={patchDraft}
                    disabled={!!disabled || save.isPending}
                    t={t}
                  />
                ) : (
                  <GenericStepConfig config={draftConfig} onPatch={patchDraft} disabled={!!disabled || save.isPending} t={t} />
                )}
              </>
            ) : null}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex flex-wrap items-center gap-2 border-t border-[#EDE9E1] bg-[#FBF9F6] px-5 py-3.5 dark:border-[#243044] dark:bg-[#0B1220]">
        <span className="mr-auto text-[12.5px] text-[#4A5568] dark:text-[#9AA3B5]">
          {estimate.credits > 0 ? (
            <>
              {t("askUser.preview.footerImages", { count: estimate.images })}
              {" · "}
              {t("askUser.preview.footerCredits", { count: estimate.credits })}
              {estimate.basis === "list_price" ? (
                <span className="ml-1 opacity-80"> {t("askUser.preview.footerListPrice")}</span>
              ) : null}
            </>
          ) : (
            t("askUser.preview.footerCreditsWhenStart")
          )}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="rounded-[9px] text-[13px] font-semibold text-[#090C11] dark:text-[#F3F1EC]"
          disabled={disabled || save.isPending}
          onClick={dismiss}
        >
          {t("askUser.preview.cancel")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-[9px] border-[#D9D3C7] bg-white text-[13px] font-semibold text-[#090C11] dark:border-[#243044] dark:bg-[#121A2B] dark:text-[#F3F1EC]"
          disabled={disabled || save.isPending}
          onClick={() => pick("change")}
        >
          {t("askUser.preview.changeSettings")}
        </Button>
        <Button
          type="button"
          size="sm"
          className="rounded-[9px] border-[#00C9A7] bg-[#00C9A7] text-[13px] font-semibold text-[#0F1F3D] hover:bg-[#00A589] hover:text-white dark:text-[#0F1F3D]"
          disabled={disabled || save.isPending}
          onClick={() => void start()}
        >
          {startLabel}
        </Button>
      </div>
    </div>
  )
}

function ImageStepConfig({
  tab,
  setTab,
  config,
  onPatch,
  disabled,
  t,
  attachedCount,
  brandImageCount,
}: {
  tab: string
  setTab: (id: string) => void
  config: Record<string, unknown>
  onPatch: (p: Record<string, unknown>) => void
  disabled: boolean
  t: (k: string, o?: Record<string, unknown>) => string
  attachedCount: number
  brandImageCount: number
}) {
  const tabs = [
    { id: "style", label: t("askUser.preview.tabs.style") },
    { id: "size", label: t("askUser.preview.tabs.size") },
    { id: "references", label: t("askUser.preview.tabs.references") },
    { id: "prompt", label: t("askUser.preview.tabs.prompt") },
  ]
  const imageType = String(config._uiImageType ?? config.style ?? "website_mockup")
  const mood = String(config._uiMood ?? "clean")
  const count = Number(config._uiImageCount ?? 1) || 1
  const wasCount = Number(config._uiWasImageCount ?? 1) || 1
  const useAttached = config._uiUseAttached !== false
  const useBrand = config._uiUseBrandImages === true
  const usePalette = config._uiUseBrandPalette !== false
  const useLogo = config._uiUseLogo !== false
  const aspect = String(config.aspectRatio ?? "1:1")

  return (
    <div className="flex flex-col gap-3">
      <Segmented tabs={tabs} value={tab} onChange={setTab} />
      {tab === "style" ? (
        <>
          <div>
            <div className="mb-1.5 text-xs font-semibold text-[#4A5568]">{t("askUser.preview.fields.imageType")}</div>
            <div className="flex flex-wrap gap-1.5">
              {IMAGE_TYPES.map((id) => (
                <Chip
                  key={id}
                  label={t(`askUser.preview.imageTypes.${id}`)}
                  on={imageType === id}
                  disabled={disabled}
                  onClick={() =>
                    onPatch({
                      _uiImageType: id,
                      // Live: only persist style when it matches a backend style token.
                      ...(id === "watercolor" || id === "illustration" || id === "photo"
                        ? { style: id }
                        : { style: undefined }),
                    })
                  }
                />
              ))}
            </div>
            {imageType !== "watercolor" ? (
              <p className="mt-1 text-[11.5px] text-[#718096]">{t("askUser.preview.hints.watercolorSkipped")}</p>
            ) : null}
          </div>
          <div>
            <div className="mb-1.5 text-xs font-semibold text-[#4A5568]">{t("askUser.preview.fields.mood")}</div>
            <div className="flex flex-wrap gap-1.5">
              {MOODS.map((id) => (
                <Chip
                  key={id}
                  label={t(`askUser.preview.moods.${id}`)}
                  on={mood === id}
                  readOnly
                />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <div>
              <div className="mb-1.5 text-xs font-semibold text-[#4A5568]">{t("askUser.preview.fields.brandColors")}</div>
              <ToggleRow
                label={t("askUser.preview.fields.useBrandPalette")}
                on={usePalette}
                readOnly
              />
            </div>
            <div>
              <div className="mb-1.5 text-xs font-semibold text-[#4A5568]">{t("askUser.preview.fields.logo")}</div>
              <ToggleRow
                label={t("askUser.preview.fields.addLogo")}
                on={useLogo}
                readOnly
              />
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-xs font-semibold text-[#4A5568]">
              {t("askUser.preview.fields.howManyImages")}{" "}
              <span className="font-semibold text-[#00A589]">· {t("askUser.preview.fields.wasN", { n: wasCount })}</span>
            </div>
            <div
              className="flex w-[120px] items-center justify-between rounded-[9px] border border-dashed border-[#D9D3C7] bg-[#FBF9F6] px-2.5 py-1.5 font-semibold text-[#4A5568] opacity-80"
              aria-disabled="true"
              title="View only — not saved yet"
            >
              <span className="opacity-40">−</span>
              <span>{count}</span>
              <span className="opacity-40">+</span>
            </div>
            <p className="mt-1 text-[11.5px] text-[#718096]">{t("askUser.preview.hints.imageCountNotInOneRun")}</p>
          </div>
        </>
      ) : null}
      {tab === "size" ? (
        <div>
          <div className="mb-1.5 text-xs font-semibold text-[#4A5568]">{t("askUser.preview.fields.size")}</div>
          <div className="flex gap-2">
            {ASPECTS.map((a) => (
              <button
                key={a.value}
                type="button"
                disabled={disabled}
                onClick={() => onPatch({ aspectRatio: a.value })}
                className={cn(
                  "flex-1 rounded-[9px] border px-1.5 py-2 text-center text-xs font-semibold",
                  aspect === a.value ? "border-[#0F1F3D] shadow-[0_0_0_2px_#E8EDF6]" : "border-[#D9D3C7]",
                )}
              >
                <i
                  className="mx-auto mb-1 block rounded-[3px] border-[1.5px] border-[#718096]"
                  style={{ width: a.w, height: a.h }}
                />
                {a.value}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[11.5px] text-[#718096]">{t("askUser.preview.hints.sizeTab")}</p>
        </div>
      ) : null}
      {tab === "references" ? (
        <>
          <ToggleRow
            label={<b>{t("askUser.preview.fields.useAttached")}</b>}
            hint={t("askUser.preview.hints.attachedCount", { count: attachedCount })}
            on={useAttached}
            readOnly
          />
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: Math.min(3, Math.max(attachedCount, useAttached ? 1 : 0)) }).map((_, i) => (
              <div
                key={i}
                className="h-[58px] w-[84px] rounded-lg border border-[#D9D3C7] bg-gradient-to-br from-[#E8EDF6] to-[#B8C6E0]"
              />
            ))}
            <div
              className="grid h-[58px] w-[84px] place-items-center rounded-lg border border-dashed border-[#D9D3C7] bg-[#FBF9F6] text-[12px] text-[#718096] opacity-70"
              aria-disabled="true"
              title="View only — not saved yet"
            >
              {t("askUser.preview.fields.add")}
            </div>
          </div>
          <ToggleRow
            label={t("askUser.preview.fields.useBrandImages", { count: brandImageCount })}
            on={useBrand}
            readOnly
          />
          <div>
            <div className="mb-1.5 text-xs font-semibold text-[#4A5568]">{t("askUser.preview.fields.size")}</div>
            <div className="flex gap-2">
              {ASPECTS.map((a) => (
                <button
                  key={a.value}
                  type="button"
                  disabled={disabled}
                  onClick={() => onPatch({ aspectRatio: a.value })}
                  className={cn(
                    "flex-1 rounded-[9px] border px-1.5 py-2 text-center text-xs font-semibold",
                    aspect === a.value ? "border-[#0F1F3D] shadow-[0_0_0_2px_#E8EDF6]" : "border-[#D9D3C7]",
                  )}
                >
                  <i
                    className="mx-auto mb-1 block rounded-[3px] border-[1.5px] border-[#718096]"
                    style={{ width: a.w, height: a.h }}
                  />
                  {a.value}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : null}
      {tab === "prompt" ? (
        <div>
          <div className="mb-1.5 text-xs font-semibold text-[#4A5568]">{t("askUser.preview.fields.prompt")}</div>
          <Textarea
            value={String(config.negativePrompt ?? config.customPrompt ?? "")}
            disabled={disabled}
            rows={4}
            className="rounded-[9px] border-[#D9D3C7] text-[13px]"
            placeholder={t("askUser.preview.fields.promptPlaceholder")}
            onChange={(e) => onPatch({ negativePrompt: e.target.value })}
          />
          <p className="mt-1 text-[11.5px] text-[#718096]">{t("askUser.preview.hints.promptMapsToNegative")}</p>
        </div>
      ) : null}
    </div>
  )
}

function AdaptStepConfig({
  tab,
  setTab,
  config,
  onPatch,
  disabled,
  t,
}: {
  tab: string
  setTab: (id: string) => void
  config: Record<string, unknown>
  onPatch: (p: Record<string, unknown>) => void
  disabled: boolean
  t: (k: string, o?: Record<string, unknown>) => string
}) {
  const tabs = [
    { id: "text", label: t("askUser.preview.tabs.text") },
    { id: "hashtags", label: t("askUser.preview.tabs.hashtags") },
  ]
  const length = String(config.textLength ?? "short")
  const tone = String(config.tone ?? "casual")
  const langs = Array.isArray(config._uiLanguages)
    ? (config._uiLanguages as string[])
    : ["th", "en"]
  const note = String(config.customPrompt ?? config._uiExtraNote ?? "")

  return (
    <div className="flex flex-col gap-3">
      <Segmented tabs={tabs} value={tab === "hashtags" ? "hashtags" : "text"} onChange={setTab} />
      {tab !== "hashtags" ? (
        <>
          <div>
            <div className="mb-1.5 text-xs font-semibold text-[#4A5568]">{t("askUser.preview.fields.length")}</div>
            <div className="flex flex-wrap gap-1.5">
              <Chip label={t("askUser.preview.lengths.short")} on={length === "short"} disabled={disabled} onClick={() => onPatch({ textLength: "short" })} />
              <Chip label={t("askUser.preview.lengths.medium")} on={length === "medium"} disabled={disabled} onClick={() => onPatch({ textLength: "medium" })} />
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-xs font-semibold text-[#4A5568]">{t("askUser.preview.fields.tone")}</div>
            <div className="flex flex-wrap gap-1.5">
              {(["casual", "professional", "friendly"] as const).map((id) => (
                <Chip
                  key={id}
                  label={t(`askUser.preview.tones.${id}`)}
                  on={tone === id || (id === "friendly" && tone === "fun")}
                  disabled={disabled}
                  onClick={() => onPatch({ tone: id === "friendly" ? "friendly" : id })}
                />
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-xs font-semibold text-[#4A5568]">{t("askUser.preview.fields.language")}</div>
            <div className="flex flex-wrap gap-1.5">
              {(["th", "en"] as const).map((id) => (
                <Chip
                  key={id}
                  label={id === "th" ? "à¹à¸à¸¢" : "English"}
                  on={langs.includes(id)}
                  readOnly
                />
              ))}
            </div>
            <p className="mt-1 text-[11.5px] text-[#718096]">{t("askUser.preview.hints.languageDisplayOnly")}</p>
          </div>
          <div>
            <div className="mb-1.5 text-xs font-semibold text-[#4A5568]">{t("askUser.preview.fields.extraNote")}</div>
            <Textarea
              value={note}
              disabled={disabled}
              rows={3}
              className="min-h-[84px] rounded-[9px] border-[#D9D3C7] text-[13px] leading-relaxed"
              onChange={(e) => onPatch({ customPrompt: e.target.value, _uiExtraNote: e.target.value })}
            />
          </div>
        </>
      ) : (
        <div>
          <div className="mb-1.5 text-xs font-semibold text-[#4A5568]">{t("askUser.preview.fields.hashtagNote")}</div>
          <Textarea
            value={String(config._uiHashtagNote ?? "")}
            readOnly
            rows={3}
            className="rounded-[9px] border-dashed border-[#D9D3C7] bg-[#FBF9F6] text-[13px] text-[#4A5568] opacity-80"
            placeholder={t("askUser.preview.fields.hashtagPlaceholder")}
          />
          <p className="mt-1 text-[11.5px] text-[#718096]">{t("askUser.preview.hints.hashtagsDisplayOnly")}</p>
        </div>
      )}
    </div>
  )
}

function KeywordStepConfig({
  tab,
  setTab,
  config,
  topic,
  onPatch,
  disabled,
  t,
}: {
  tab: string
  setTab: (id: string) => void
  config: Record<string, unknown>
  topic: string
  onPatch: (p: Record<string, unknown>) => void
  disabled: boolean
  t: (k: string, o?: Record<string, unknown>) => string
}) {
  const tabs = [
    { id: "basics", label: t("askUser.preview.tabs.basics") },
    { id: "advanced", label: t("askUser.preview.tabs.advanced") },
  ]
  const market = String(config._uiMarket ?? config.market ?? "global")
  const keywords = Array.isArray(config._uiKeywords)
    ? (config._uiKeywords as string[])
    : typeof config.customPrompt === "string" && config.customPrompt
      ? config.customPrompt.split(",").map((s) => s.trim()).filter(Boolean)
      : []
  const useBrandKw = config._uiUseBrandKeywords !== false
  const topicValue = String(config._uiTopic ?? topic)

  return (
    <div className="flex flex-col gap-3">
      <Segmented tabs={tabs} value={tab === "advanced" ? "advanced" : "basics"} onChange={setTab} />
      {tab !== "advanced" ? (
        <>
          <div>
            <div className="mb-1.5 text-xs font-semibold text-[#4A5568]">{t("askUser.preview.fields.topic")}</div>
            <Input
              value={topicValue}
              readOnly
              className="rounded-[9px] border-dashed border-[#D9D3C7] bg-[#FBF9F6] text-[13px] text-[#4A5568]"
              title="View only — not saved yet"
            />
          </div>
          <div>
            <div className="mb-1.5 text-xs font-semibold text-[#4A5568]">{t("askUser.preview.fields.market")}</div>
            <div className="flex flex-wrap gap-1.5">
              <Chip label={t("askUser.preview.markets.thailand")} on={market === "th"} readOnly />
              <Chip label={t("askUser.preview.markets.global")} on={market === "global"} readOnly />
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-xs font-semibold text-[#4A5568]">{t("askUser.preview.fields.keywords")}</div>
            <div className="flex flex-wrap gap-1.5">
              {keywords.map((kw) => (
                <span key={kw} className="rounded-[7px] border border-[#EDE9E1] bg-[#F7F4EF] px-2.5 py-1 text-xs">
                  {kw}
                </span>
              ))}
              <button
                type="button"
                disabled={disabled}
                className="rounded-[7px] border border-dashed border-[#D9D3C7] bg-white px-2.5 py-1 text-xs text-[#718096]"
                onClick={() => {
                  const next = window.prompt(t("askUser.preview.fields.addKeyword"))
                  if (next?.trim()) onPatch({ _uiKeywords: [...keywords, next.trim()], customPrompt: [...keywords, next.trim()].join(", ") })
                }}
              >
                {t("askUser.preview.fields.add")}
              </button>
            </div>
          </div>
          <ToggleRow
            label={t("askUser.preview.fields.useBrandKeywords")}
            on={useBrandKw}
            readOnly
          />
        </>
      ) : (
        <div>
          <div className="mb-1.5 text-xs font-semibold text-[#4A5568]">{t("askUser.preview.fields.extraNote")}</div>
          <Textarea
            value={String(config.customPrompt ?? "")}
            disabled={disabled}
            rows={4}
            className="rounded-[9px] border-[#D9D3C7] text-[13px]"
            onChange={(e) => onPatch({ customPrompt: e.target.value })}
          />
          <p className="mt-1 text-[11.5px] text-[#718096]">{t("askUser.preview.hints.keywordAdvanced")}</p>
        </div>
      )}
    </div>
  )
}

function GenericStepConfig({
  config,
  onPatch,
  disabled,
  t,
}: {
  config: Record<string, unknown>
  onPatch: (p: Record<string, unknown>) => void
  disabled: boolean
  t: (k: string, o?: Record<string, unknown>) => string
}) {
  const entries = Object.entries(config).filter(([k]) => !k.startsWith("_ui"))
  if (entries.length === 0) {
    return <p className="text-xs text-[#718096]">{t("askUser.preview.noSettings")}</p>
  }
  return (
    <dl className="grid gap-2 text-[13px]">
      {entries.map(([k, v]) => (
        <div key={k} className="flex min-w-0 flex-col gap-1">
          <dt className="text-xs font-semibold text-[#4A5568]">{k}</dt>
          <dd>
            <Input
              value={Array.isArray(v) ? v.join(", ") : String(v ?? "")}
              disabled={disabled}
              className="rounded-[9px] border-[#D9D3C7] text-[13px]"
              onChange={(e) => onPatch({ [k]: e.target.value })}
            />
          </dd>
        </div>
      ))}
    </dl>
  )
}

