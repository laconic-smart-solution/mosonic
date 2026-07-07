import { motion, useReducedMotion } from "framer-motion"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { cn } from "@/lib/utils"
import {
  landingRevealUp,
  landingStaggerContainer,
  landingViewport,
} from "@/features/marketing/lib/landing-motion"

const FEATURE_IDS = ["plan", "create", "publish", "measure"] as const

export function LandingFeaturesSection() {
  const { t } = useTranslation("marketing")
  const reduceMotion = useReducedMotion()

  return (
    <motion.section
      id="features"
      className="scroll-mt-20 bg-background/78 py-20 backdrop-blur-[2px] sm:py-24"
      variants={landingStaggerContainer}
      initial={reduceMotion ? false : "hidden"}
      whileInView={reduceMotion ? undefined : "show"}
      viewport={landingViewport}
    >
      <div className="mx-auto max-w-[1180px] px-7">
        <motion.div className="mb-10 max-w-xl space-y-4 sm:mb-12" variants={landingRevealUp}>
          <p
            className={cn(
              "inline-flex items-center gap-2 font-mono text-[12.5px] tracking-[0.14em] text-teal-600 uppercase dark:text-teal-400",
              "before:inline-block before:h-0.5 before:w-3.5 before:bg-amber-400 before:content-['']",
            )}
          >
            {t("landing.features.eyebrow")}
          </p>
          <h2 className="font-heading text-3xl leading-tight font-bold tracking-tight text-navy-700 sm:text-[2rem] dark:text-foreground">
            {t("landing.features.title")}
          </h2>
        </motion.div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-7">
          {FEATURE_IDS.map((id) => (
            <motion.article
              key={id}
              variants={landingRevealUp}
              className="rounded-md border border-border bg-card p-7 shadow-sm"
            >
              <p
                className={cn(
                  "inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.14em] text-teal-600 uppercase dark:text-teal-400",
                  "before:inline-block before:h-0.5 before:w-3 before:bg-amber-400 before:content-['']",
                )}
              >
                {t(`landing.features.items.${id}.eyebrow`)}
              </p>
              <h3 className="mt-2.5 text-lg font-semibold text-foreground">
                {t(`landing.features.items.${id}.title`)}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-[14.5px]">
                {t(`landing.features.items.${id}.description`)}
              </p>
            </motion.article>
          ))}
        </div>

        <motion.p
          className="mt-6 text-sm text-muted-foreground sm:mt-8 sm:text-[14.5px]"
          variants={landingRevealUp}
        >
          <Link
            to={{ pathname: "/", hash: "features" }}
            className="font-medium text-teal-600 underline-offset-4 hover:underline dark:text-teal-400"
          >
            {t("landing.features.link")}
          </Link>
        </motion.p>
      </div>
    </motion.section>
  )
}
