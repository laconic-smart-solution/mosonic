import { useTranslation } from "react-i18next"
import { channelLabel } from "@/shared/constants/distribution-channels"
import type { RuleIntakeAnswers } from "@/features/rules/types/rule-intake.type"
import { intakeChannelsToIds } from "@/features/rules/types/rule-intake.type"

type Props = {
  answers: RuleIntakeAnswers
  attachmentCount: number
}

export function RuleQaReviewStep({ answers, attachmentCount }: Props) {
  const { t } = useTranslation("rules")
  const channelIds = intakeChannelsToIds(answers.channels)

  const rows: Array<{ label: string; value: string }> = [
    {
      label: t("qaWizard.review.purpose"),
      value: answers.contentPurpose
        ? t(`qaWizard.purpose.${answers.contentPurpose}.title`)
        : "—",
    },
    {
      label: t("qaWizard.review.brand"),
      value: answers.brandName?.trim() || "—",
    },
    {
      label: t("qaWizard.review.audience"),
      value: answers.audienceDescription?.trim() || "—",
    },
    {
      label: t("qaWizard.review.channels"),
      value:
        channelIds.length > 0
          ? channelIds.map((id) => channelLabel(id)).join(", ")
          : "—",
    },
    {
      label: t("qaWizard.review.sources"),
      value: t("qaWizard.review.sourceSummary", { count: attachmentCount }),
    },
  ]

  return (
    <ul className="divide-y divide-border rounded-xl border border-border">
      {rows.map((row) => (
        <li key={row.label} className="flex flex-col gap-1 px-4 py-3 text-sm">
          <span className="text-xs font-medium text-muted-foreground">
            {row.label}
          </span>
          <span>{row.value}</span>
        </li>
      ))}
    </ul>
  )
}
