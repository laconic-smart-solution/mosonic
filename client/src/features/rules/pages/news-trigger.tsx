import { useParams } from "react-router-dom"

import type { RuleEntity } from "@/features/rules/data/rules-mock"
import { NewsTriggerSettingsPanel } from "@/features/rules/components/news-trigger/news-trigger-settings"
import { useRuleByIdQuery } from "@/shared/queries/rule.query"

export default function NewsTriggerPage() {
  const { ruleId } = useParams<{ ruleId: string }>()
  const { data: rule } = useRuleByIdQuery<RuleEntity>(ruleId)

  if (!ruleId) {
    return (
      <p className="p-8 text-sm text-muted-foreground">Missing rule id.</p>
    )
  }

  return (
    <NewsTriggerSettingsPanel ruleId={ruleId} ruleName={rule?.name} />
  )
}
