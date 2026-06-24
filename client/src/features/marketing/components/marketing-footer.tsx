import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import Logo from "@/assets/icon/logo"
import { cn } from "@/lib/utils"

export function MarketingFooter() {
  const { t } = useTranslation(["marketing", "common"])

  return (
    <footer
      className={cn(
        "relative z-[1] border-t border-border bg-background px-7 py-14 text-sm text-muted-foreground",
      )}
    >
      <div>
        <div className="grid gap-8 border-b border-border pb-9 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <div className="mb-3 flex items-center gap-2.5 font-sans text-lg font-bold text-foreground">
              <Logo className="size-6 shrink-0" />
              {t("common:appName")}
            </div>
            <p className="max-w-60 leading-relaxed">{t("footer.tagline")}</p>
          </div>

          <div>
            <h4 className="mb-3.5 font-mono text-xs tracking-[0.1em] text-foreground uppercase">
              {t("footer.product")}
            </h4>
            <ul className="flex flex-col gap-2">
              <li>
                <Link
                  to="/home"
                  className="transition-colors hover:text-teal-600 dark:hover:text-teal-400"
                >
                  {t("footer.features")}
                </Link>
              </li>
              <li>
                <Link
                  to="/pricing"
                  className="transition-colors hover:text-teal-600 dark:hover:text-teal-400"
                >
                  {t("nav.pricing")}
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="mb-3.5 font-mono text-xs tracking-[0.1em] text-foreground uppercase">
              {t("footer.company")}
            </h4>
            <ul className="flex flex-col gap-2">
              <li>
                <Link
                  to="/about"
                  className="transition-colors hover:text-teal-600 dark:hover:text-teal-400"
                >
                  {t("nav.about")}
                </Link>
              </li>
              <li>
                <span>{t("footer.contact")}</span>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="mb-3.5 font-mono text-xs tracking-[0.1em] text-foreground uppercase">
              {t("footer.getStarted")}
            </h4>
            <ul className="flex flex-col gap-2">
              <li>
                <Link
                  to="/pricing"
                  className="transition-colors hover:text-teal-600 dark:hover:text-teal-400"
                >
                  {t("footer.startFree")}
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-5 font-mono text-xs sm:flex-row sm:justify-between">
          <span>{t("footer.copyright")}</span>
          <span>{t("footer.legal")}</span>
        </div>
      </div>
    </footer>
  )
}
