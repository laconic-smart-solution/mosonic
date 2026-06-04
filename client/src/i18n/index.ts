import i18n from "i18next"
import LanguageDetector from "i18next-browser-languagedetector"
import { initReactI18next } from "react-i18next"

import {
  resolveSupportedLanguage,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from "./language"
import { I18N_NAMESPACES, resources } from "./resources"

export const UI_LOCALE_STORAGE_KEY = "ui-locale"
export { SUPPORTED_LANGUAGES, type SupportedLanguage }

function syncDocumentLanguage(lng: string) {
  const resolved = resolveSupportedLanguage(lng)
  const htmlLang = resolved === "zh-CN" ? "zh-Hans" : resolved
  document.documentElement.lang = htmlLang
  const title = i18n.t("common:appName")
  if (title && title !== "appName") {
    document.title = title
  }
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: {
      zh: ["zh-CN"],
      "zh-Hans": ["zh-CN"],
      "zh-Hant": ["zh-CN"],
      default: ["en"],
    },
    supportedLngs: [...SUPPORTED_LANGUAGES, "zh", "zh-Hans", "zh-Hant"],
    nonExplicitSupportedLngs: false,
    load: "currentOnly",
    ns: [...I18N_NAMESPACES],
    defaultNS: "common",
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: UI_LOCALE_STORAGE_KEY,
      caches: ["localStorage"],
    },
    react: { useSuspense: false },
    saveMissing: import.meta.env.DEV,
    missingKeyHandler: import.meta.env.DEV
      ? (_lngs, ns, key) => {
          console.warn(`[i18n] missing key: ${ns}:${key}`)
        }
      : undefined,
  })
  .then(async () => {
    const resolved = resolveSupportedLanguage(i18n.language)
    if (i18n.language !== resolved) {
      await i18n.changeLanguage(resolved)
    }
    syncDocumentLanguage(resolved)
  })

i18n.on("languageChanged", (lng) => {
  const resolved = resolveSupportedLanguage(lng)
  if (lng !== resolved) {
    void i18n.changeLanguage(resolved)
    return
  }
  syncDocumentLanguage(resolved)
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(UI_LOCALE_STORAGE_KEY, resolved)
  }
})

export default i18n
