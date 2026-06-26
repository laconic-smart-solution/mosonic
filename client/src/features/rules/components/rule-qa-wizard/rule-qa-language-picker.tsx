import { useTranslation } from "react-i18next"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

const LANGUAGE_OPTIONS = [
  { value: "th", labelKey: "thai" },
  { value: "en", labelKey: "english" },
  { value: "ja", labelKey: "japanese" },
  { value: "zh", labelKey: "chinese" },
  { value: "ko", labelKey: "korean" },
  { value: "es", labelKey: "spanish" },
  { value: "fr", labelKey: "french" },
  { value: "de", labelKey: "german" },
] as const

type Props = {
  primaryLanguage: string
  targetLanguages: string[]
  onPrimaryChange: (lang: string) => void
  onTargetChange: (languages: string[]) => void
}

export function RuleQaLanguagePicker({
  primaryLanguage,
  targetLanguages,
  onPrimaryChange,
  onTargetChange,
}: Props) {
  const { t } = useTranslation("rules")

  function toggleTarget(lang: string) {
    onTargetChange(
      targetLanguages.includes(lang)
        ? targetLanguages.filter((l) => l !== lang)
        : [...targetLanguages, lang],
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          {t("qaWizard.steps.audience.primaryLanguageLabel")}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {LANGUAGE_OPTIONS.map((opt) => {
            const id = `rule-qa-primary-${opt.value}`
            const selected = primaryLanguage === opt.value
            return (
              <label
                key={opt.value}
                htmlFor={id}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 transition-colors",
                  selected
                    ? "border-primary/50 bg-primary/5"
                    : "border-border hover:border-primary/30 hover:bg-muted/40",
                )}
              >
                <Checkbox
                  id={id}
                  checked={selected}
                  onCheckedChange={() => onPrimaryChange(opt.value)}
                />
                <Label htmlFor={id} className="cursor-pointer font-normal">
                  {t(`qaWizard.languages.${opt.labelKey}`)}
                </Label>
              </label>
            )
          })}
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          {t("qaWizard.steps.audience.targetLanguagesLabel")}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {LANGUAGE_OPTIONS.map((opt) => {
            const id = `rule-qa-target-${opt.value}`
            return (
              <label
                key={opt.value}
                htmlFor={id}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 transition-colors",
                  targetLanguages.includes(opt.value)
                    ? "border-primary/50 bg-primary/5"
                    : "border-border hover:border-primary/30 hover:bg-muted/40",
                )}
              >
                <Checkbox
                  id={id}
                  checked={targetLanguages.includes(opt.value)}
                  onCheckedChange={() => toggleTarget(opt.value)}
                />
                <Label htmlFor={id} className="cursor-pointer font-normal">
                  {t(`qaWizard.languages.${opt.labelKey}`)}
                </Label>
              </label>
            )
          })}
        </div>
      </div>
    </div>
  )
}
