import { useTranslation } from "react-i18next"
import {
  CONTENT_PURPOSES,
  type ContentPurpose,
} from "@/features/rules/types/rule-intake.type"
import { cn } from "@/lib/utils"

type Props = {
  value?: ContentPurpose
  onChange: (purpose: ContentPurpose) => void
}

export function RuleQaPurposePicker({ value, onChange }: Props) {
  const { t } = useTranslation("rules")

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {CONTENT_PURPOSES.map((purpose) => {
        const selected = value === purpose
        return (
          <button
            key={purpose}
            type="button"
            onClick={() => onChange(purpose)}
            className={cn(
              "rounded-xl border px-4 py-4 text-left transition-colors",
              selected
                ? "border-primary bg-primary/10 shadow-sm ring-2 ring-primary/30"
                : "border-border bg-background hover:border-primary/40 hover:bg-muted/40",
            )}
          >
            <span className="block text-sm font-medium">
              {t(`qaWizard.purpose.${purpose}.title`)}
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">
              {t(`qaWizard.purpose.${purpose}.description`)}
            </span>
          </button>
        )
      })}
    </div>
  )
}
