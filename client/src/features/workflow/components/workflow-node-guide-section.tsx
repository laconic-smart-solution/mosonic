import { useTranslation } from "react-i18next"
import { getWorkflowNodeGuide } from "@/features/workflow/data/workflow-node-guide"
import { T } from "@/lib/tokens"

type WorkflowNodeGuideSectionProps = {
  canvasType: string
}

function GuideBlock({
  label,
  children,
}: {
  label: string
  children: string
}) {
  return (
    <div
      className="rounded-lg border px-2.5 py-2"
      style={{ borderColor: T.surfaceBorder }}
    >
      <p
        className="mb-1 text-[10px] font-bold tracking-wide uppercase"
        style={{ color: T.textSecondary }}
      >
        {label}
      </p>
      <p className="text-[11px] leading-relaxed" style={{ color: T.textPrimary }}>
        {children}
      </p>
    </div>
  )
}

export function WorkflowNodeGuideSection({ canvasType }: WorkflowNodeGuideSectionProps) {
  const { t } = useTranslation("workflow")
  const guide = getWorkflowNodeGuide(canvasType)

  if (!guide) {
    return (
      <div
        className="rounded-lg border px-2.5 py-2 text-[11px] leading-relaxed"
        style={{ borderColor: T.surfaceBorder, color: T.textSecondary }}
      >
        {t("guide.defaultFallback")}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <GuideBlock label={t("guide.labels.usage")}>{guide.usage}</GuideBlock>
      <GuideBlock label={t("guide.labels.example")}>{guide.example}</GuideBlock>
      {guide.tips ? (
        <div className="rounded-lg border border-[#FCD34D] bg-[#FFFBEB] px-2.5 py-2">
          <p className="text-[10px] font-semibold text-[#D97706]">{t("guide.labels.tip")}</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-[#92400E]">{guide.tips}</p>
        </div>
      ) : null}
    </div>
  )
}

/** Compact guide copy for node info hover tooltips. */
export function WorkflowNodeGuideTooltipContent({
  canvasType,
}: WorkflowNodeGuideSectionProps) {
  const { t } = useTranslation("workflow")
  const guide = getWorkflowNodeGuide(canvasType)

  if (!guide) {
    return (
      <p className="max-w-[260px] text-[11px] leading-relaxed text-background/90">
        {t("guide.defaultFallback")}
      </p>
    )
  }

  return (
    <div className="flex max-w-[min(300px,calc(100vw-4rem))] flex-col gap-2.5 text-left">
      <div>
        <p className="text-[10px] font-semibold tracking-wide text-background/70 uppercase">
          {t("guide.labels.usage")}
        </p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-background/95">
          {guide.usage}
        </p>
      </div>
      <div>
        <p className="text-[10px] font-semibold tracking-wide text-background/70 uppercase">
          {t("guide.labels.example")}
        </p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-background/95">
          {guide.example}
        </p>
      </div>
      {guide.tips ? (
        <div>
          <p className="text-[10px] font-semibold tracking-wide text-amber-200 uppercase">
            {t("guide.labels.tip")}
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-background/95">
            {guide.tips}
          </p>
        </div>
      ) : null}
    </div>
  )
}
