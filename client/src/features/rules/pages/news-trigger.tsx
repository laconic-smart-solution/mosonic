import { useTranslation } from "react-i18next"
import { useParams } from "react-router-dom"

import { PageShell } from "@/components/app/page-shell"
import { useSetBreadcrumbLabel } from "@/components/app/breadcrumb-override.context"
import type { RuleEntity } from "@/features/rules/data/rules-mock"
import { NewsTriggerSettingsPanel } from "@/features/rules/components/news-trigger/news-trigger-settings"
import { useRuleByIdQuery } from "@/shared/queries/rule.query"

export default function NewsTriggerPage() {
  const { t } = useTranslation("rules")
  const { ruleId } = useParams<{ ruleId: string }>()
  const { data: rule } = useRuleByIdQuery<RuleEntity>(ruleId)

  useSetBreadcrumbLabel(
    rule?.name
      ? `${rule.name} · ${t("common:breadcrumb.newsTrigger")}`
      : undefined,
  )

  if (!ruleId) {
    return (
      <PageShell>
        <p className="text-sm text-muted-foreground">{t("newsTrigger.missingRuleId")}</p>
      </PageShell>
    )
  }

  return (
    <PageShell>
      <NewsTriggerSettingsPanel ruleId={ruleId} ruleName={rule?.name} />
    </PageShell>
  )
}
