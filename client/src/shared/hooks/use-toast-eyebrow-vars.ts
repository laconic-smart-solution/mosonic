import { useEffect } from "react"
import { useTranslation } from "react-i18next"

const EYEBROW_KEYS = [
  "success",
  "error",
  "warning",
  "info",
  "loading",
  "default",
] as const

/** Syncs i18n toast eyebrow labels to CSS custom properties for ::before content. */
export function useToastEyebrowVars(): void {
  const { t, i18n } = useTranslation("common")

  useEffect(() => {
    const root = document.documentElement

    const apply = () => {
      for (const key of EYEBROW_KEYS) {
        const value = t(`toast.eyebrow.${key}`)
        root.style.setProperty(
          `--toast-eyebrow-${key}`,
          `"${value.replace(/"/g, '\\"')}"`,
        )
      }
    }

    apply()
    i18n.on("languageChanged", apply)
    return () => {
      i18n.off("languageChanged", apply)
    }
  }, [t, i18n])
}
