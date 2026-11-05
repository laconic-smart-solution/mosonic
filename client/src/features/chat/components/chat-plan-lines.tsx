import { useTranslation } from "react-i18next"

import type { AskUserPlan } from "../lib/parse-ask-user"

/** Plan confirm card: You asked for / I'll change / Not possible (empty lines omitted). */
export function ChatPlanLines({ plan }: { plan: AskUserPlan }) {
  const { t } = useTranslation("chat")
  const rows = [
    { key: "asked", text: plan.youAskedFor },
    { key: "willChange", text: plan.willChange.join("; ") },
    { key: "notPossible", text: plan.notPossible.join("; ") },
  ].filter((r) => r.text)
  return (
    <dl className="space-y-1 text-xs text-canvas-600 dark:text-navy-200">
      {rows.map((r) => (
        <div key={r.key} className="flex min-w-0 gap-2">
          <dt className="shrink-0 font-medium text-navy-700 dark:text-[#E8EDF6]">{t(`askUser.plan.${r.key}`)}</dt>
          <dd className={r.key === "notPossible" ? "min-w-0 break-words text-amber-700 dark:text-amber-300" : "min-w-0 break-words"}>{r.text}</dd>
        </div>
      ))}
    </dl>
  )
}
