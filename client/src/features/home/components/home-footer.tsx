import { LanguageSwitcher } from "@/components/language-switcher"
import { useTranslation } from "react-i18next"

export function HomeFooter() {
  const { t } = useTranslation("home")

  return (
    <footer className="relative z-[1] flex items-center justify-between border-t border-border bg-background/80 px-6 py-3.5 backdrop-blur-sm">
      <span className="text-[11px] text-muted-foreground">{t("footer.copyright")}</span>
      <LanguageSwitcher className="h-7 border-0 bg-transparent shadow-none" showIcon={false} />
    </footer>
  )
}
