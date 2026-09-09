import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { Joyride, EVENTS, type EventData, type Step } from "react-joyride"

import { T } from "@/lib/tokens"

const TOUR_STEP_KEYS = [
  "wfNodePalette",
  "wfCanvas",
  "wfRunCost",
  "wfSave",
  "wfRun",
  "wfPromptBar",
  "wfUsedPipelines",
] as const

type TourStepKey = (typeof TOUR_STEP_KEYS)[number]

const TOUR_TARGETS: Record<TourStepKey, string> = {
  wfNodePalette: "wf-node-palette",
  wfCanvas: "wf-canvas",
  wfRunCost: "wf-run-cost",
  wfSave: "wf-save",
  wfRun: "wf-run",
  wfPromptBar: "wf-prompt-bar",
  wfUsedPipelines: "wf-used-pipelines",
}

type WorkflowGuideTourProps = {
  /** Edge-triggered: mount only while true so each run starts a fresh tour from step 0. */
  run: boolean
  onDone: () => void
}

export function WorkflowGuideTour({ run, onDone }: WorkflowGuideTourProps) {
  const { t } = useTranslation("workflow")

  // Snapshot once per run: only include steps whose target actually exists
  // right now (e.g. "Used Pipelines" only renders once a workflow is saved).
  const steps = useMemo<Step[]>(() => {
    if (!run || typeof document === "undefined") return []
    return TOUR_STEP_KEYS.reduce<Step[]>((acc, key) => {
      const selector = `[data-tour="${TOUR_TARGETS[key]}"]`
      if (!document.querySelector(selector)) return acc
      acc.push({
        target: selector,
        title: t(`tour.steps.${key}.title`),
        content: t(`tour.steps.${key}.content`),
        placement: key === "wfCanvas" ? "center" : "auto",
      })
      return acc
    }, [])
  }, [run, t])

  if (!run || steps.length === 0) return null

  return (
    <Joyride
      steps={steps}
      run={run}
      continuous
      scrollToFirstStep
      options={{
        showProgress: true,
        skipBeacon: true,
        buttons: ["close", "back", "primary", "skip"],
        primaryColor: T.accent,
        textColor: T.textPrimary,
        backgroundColor: T.surfaceBg,
        arrowColor: T.surfaceBg,
        overlayColor: "rgba(15, 23, 42, 0.55)",
        zIndex: 10000,
      }}
      locale={{
        back: t("tour.nav.back"),
        close: t("tour.nav.close"),
        last: t("tour.nav.last"),
        next: t("tour.nav.next"),
        nextWithProgress: t("tour.nav.nextWithProgress"),
        skip: t("tour.nav.skip"),
      }}
      onEvent={(data: EventData) => {
        if (data.type === EVENTS.TOUR_END) onDone()
      }}
    />
  )
}
