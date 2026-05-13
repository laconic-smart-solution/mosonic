import { Link } from "react-router-dom"

import { BudgetSettingsForm } from "@/features/cost/components/budget-settings-form"
import { Button } from "@/components/ui/button"
import { T } from "@/lib/tokens"

export default function CostBudgetPage() {
  return (
    <div className="mx-auto flex w-full flex-col gap-6 px-6 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1
            className="m-0 text-2xl font-bold tracking-[-0.5px]"
            style={{ color: T.textPrimary }}
          >
            Budget settings
          </h1>
          <p className="mt-1.5 text-[13px]" style={{ color: T.textSecondary }}>
            Set limits to control AI generation spend.
          </p>
        </div>
        <Button variant="outline" size="sm">
          <Link to="/cost">Back to costs</Link>
        </Button>
      </div>
      <BudgetSettingsForm />
    </div>
  )
}
