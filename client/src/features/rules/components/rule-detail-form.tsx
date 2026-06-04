import { useEffect } from "react"
import { Loader2 } from "lucide-react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import type { RuleEntity } from "@/features/rules/data/rules-mock"
import { RuleDetailView } from "./rule-detail-view"

type RuleDetailFormProps = {
  rule: RuleEntity
  isSaving: boolean
  onSubmit: (values: RuleEntity) => Promise<RuleEntity | void>
}

export function RuleDetailForm({ rule, isSaving, onSubmit }: RuleDetailFormProps) {
  const { t } = useTranslation("rules")
  const form = useForm<RuleEntity>({
    mode: "onChange",
    defaultValues: rule,
  })

  useEffect(() => {
    form.reset(rule)
  }, [form, rule])

  const status = form.watch("status")

  const handleSave = form.handleSubmit(async (values) => {
    const saved = await onSubmit(values)
    form.reset(saved ?? values)
  })

  return (
    <div className="relative min-h-0 flex-1">
      <div className="h-full min-h-0 overflow-y-auto scroll-smooth px-4 pt-1 pb-28">
        <RuleDetailView form={form} ruleId={rule.ruleId} />
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pt-3 pb-5">
        <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border/80 bg-background/95 px-3 py-2 shadow-lg backdrop-blur-sm">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full px-5"
            onClick={() => form.reset(rule)}
            disabled={isSaving}
          >
            {t("detail.cancel")}
          </Button>
          <Button
            type="button"
            size="sm"
            className="rounded-full px-5"
            onClick={() => void handleSave()}
            disabled={isSaving || !form.formState.isDirty || status === "processing"}
          >
            {isSaving ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
                {t("detail.saving")}
              </span>
            ) : (
              t("detail.save")
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
