import { Link } from "react-router-dom"
import { useTranslation } from "react-i18next"

import { BudgetSettingsForm } from "@/features/cost/components/budget-settings-form"
import { Button } from "@/components/ui/button"
import { T } from "@/lib/tokens"

export default function CostBudgetPage() {
  const { t } = useTranslation("cost")

  return (
    <div className="mx-auto flex w-full flex-col gap-6 px-6 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1
            className="m-0 text-2xl font-bold tracking-[-0.5px]"
            style={{ color: T.textPrimary }}
          >
            {t("budget.title")}
          </h1>
          <p className="mt-1.5 text-[13px]" style={{ color: T.textSecondary }}>
            {t("budget.subtitle")}
          </p>
        </div>
        <Button variant="outline" size="sm">
          <Link to="/cost">{t("budget.backToCosts")}</Link>
        </Button>
      </div>
      <BudgetSettingsForm />
    </div>
  )
}
