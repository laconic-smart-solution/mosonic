export const SUPPORTED_LANGUAGES = ["en", "th", "zh-CN"] as const
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

/** JSON keys under common.languages (dots in zh-CN break i18next key paths). */
export const LANGUAGE_LABEL_KEYS: Record<SupportedLanguage, string> = {
  en: "en",
  th: "th",
  "zh-CN": "zhCN",
}

export function resolveSupportedLanguage(lng: string | undefined): SupportedLanguage {
  if (!lng) return "en"
  if (lng === "zh-CN" || lng.startsWith("zh")) return "zh-CN"
  if (lng === "th" || lng.startsWith("th")) return "th"
  if (lng === "en" || lng.startsWith("en")) return "en"
  return "en"
}

export function languageLabelKey(lng: SupportedLanguage): string {
  return `languages.${LANGUAGE_LABEL_KEYS[lng]}`
}
