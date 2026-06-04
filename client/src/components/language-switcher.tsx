import { useTranslation } from "react-i18next"
import { Languages } from "lucide-react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "@/i18n"
import {
  languageLabelKey,
  resolveSupportedLanguage,
} from "@/i18n/language"
import { cn } from "@/lib/utils"

type LanguageSwitcherProps = {
  className?: string
  size?: "sm" | "default"
  showIcon?: boolean
}

export function LanguageSwitcher({
  className,
  size = "sm",
  showIcon = true,
}: LanguageSwitcherProps) {
  const { t, i18n } = useTranslation("common")
  const current = resolveSupportedLanguage(i18n.language)

  return (
    <Select
      value={current}
      onValueChange={(lng) => {
        if (!lng) return
        const resolved = resolveSupportedLanguage(lng)
        void i18n.changeLanguage(resolved)
      }}
    >
      <SelectTrigger
        size={size}
        className={cn("min-w-[7.5rem] gap-1.5", className)}
        aria-label={t("language")}
      >
        {showIcon ? <Languages className="size-3.5 shrink-0 opacity-70" aria-hidden /> : null}
        <SelectValue>{t(languageLabelKey(current))}</SelectValue>
      </SelectTrigger>
      <SelectContent align="end">
        {SUPPORTED_LANGUAGES.map((lng) => (
          <SelectItem key={lng} value={lng}>
            {t(languageLabelKey(lng as SupportedLanguage))}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
