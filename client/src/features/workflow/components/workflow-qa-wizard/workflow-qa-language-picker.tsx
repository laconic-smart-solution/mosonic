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
  value: string[]
  onChange: (languages: string[]) => void
}

export function WorkflowQaLanguagePicker({ value, onChange }: Props) {
  const { t } = useTranslation("workflow")

  function toggle(lang: string) {
    onChange(
      value.includes(lang)
        ? value.filter((l) => l !== lang)
        : [...value, lang],
    )
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {LANGUAGE_OPTIONS.map((opt) => {
        const id = `qa-lang-${opt.value}`
        return (
          <label
            key={opt.value}
            htmlFor={id}
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 transition-colors",
              value.includes(opt.value)
                ? "border-primary/50 bg-primary/5"
                : "border-border hover:border-primary/30 hover:bg-muted/40",
            )}
          >
            <Checkbox
              id={id}
              checked={value.includes(opt.value)}
              onCheckedChange={() => toggle(opt.value)}
            />
            <Label htmlFor={id} className="cursor-pointer font-normal">
              {t(`qaWizard.languages.${opt.labelKey}`)}
            </Label>
          </label>
        )
      })}
    </div>
  )
}
