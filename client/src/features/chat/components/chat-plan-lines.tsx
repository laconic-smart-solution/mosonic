import { useTranslation } from "react-i18next"
import { TriangleAlert } from "lucide-react"

import type { AskUserPlan } from "../lib/parse-ask-user"
import { planAskedLines, sanitizePlanLine } from "../lib/parse-ask-user"

/** Compact plan summary boxes (You asked for / I'll change / Not possible). */
export function ChatPlanLines({ plan }: { plan: AskUserPlan }) {
  const { t } = useTranslation("chat")
  const asked = planAskedLines(plan)
  const will = plan.willChange.map(sanitizePlanLine).filter(Boolean)
  const gaps = plan.notPossible.map(sanitizePlanLine).filter(Boolean)
  if (!asked.length && !will.length && !gaps.length) return null
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      {asked.length ? (
        <div className="rounded-xl border border-[#EDE9E1] bg-[#FBF9F6] px-3 py-2.5">
          <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-[#4A5568]">
            {t("askUser.plan.asked")}
          </h4>
          <ul className="list-disc space-y-0.5 pl-4 text-[13px] leading-relaxed text-[#090C11] dark:text-[#E8EDF6]">
            {asked.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {will.length ? (
        <div className="rounded-xl border border-[#B5EFE3] bg-[#E0FAF5] px-3 py-2.5">
          <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-[#00A589]">
            {t("askUser.plan.willChange")}
          </h4>
          <ul className="list-disc space-y-0.5 pl-4 text-[13px] leading-relaxed text-[#090C11] dark:text-[#E8EDF6]">
            {will.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {gaps.length ? (
        <div className="col-span-full flex gap-2.5 rounded-xl border border-[#F5D9A6] bg-[#FEF6E4] px-3 py-2.5 text-[13px] leading-relaxed text-[#090C11] dark:text-[#E8EDF6]">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[#A86C09]" aria-hidden />
          <div>
            <b className="text-[#A86C09]">{t("askUser.plan.notPossibleYet")}:</b> {gaps.join(" ")}
          </div>
        </div>
      ) : null}
    </div>
  )
}
