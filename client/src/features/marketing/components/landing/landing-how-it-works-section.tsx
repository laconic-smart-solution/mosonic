import { motion, useReducedMotion } from "framer-motion"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"
import {
  landingRevealUp,
  landingStaggerContainer,
  landingViewport,
} from "@/features/marketing/lib/landing-motion"

const STAGE_IDS = [
  "strategy",
  "template",
  "run",
  "generate",
  "package",
  "publish",
  "track",
] as const

const eyebrowClass = cn(
  "inline-flex items-center gap-2 font-mono text-[12.5px] tracking-[0.14em] text-teal-600 uppercase dark:text-teal-400",
  "before:inline-block before:h-0.5 before:w-3.5 before:bg-amber-400 before:content-['']",
)

export function LandingHowItWorksSection() {
  const { t } = useTranslation("marketing")
  const reduceMotion = useReducedMotion()

  return (
    <motion.section
      id="how-it-works"
      className="scroll-mt-20 border-t border-border py-20 backdrop-blur-[2px] sm:py-24"
      variants={landingStaggerContainer}
      initial={reduceMotion ? false : "hidden"}
      whileInView={reduceMotion ? undefined : "show"}
      viewport={landingViewport}
    >
      <div className="mx-auto max-w-[1180px] px-7">
        <motion.div className="mb-12 max-w-xl space-y-4 sm:mb-16" variants={landingRevealUp}>
          <p className={eyebrowClass}>{t("landing.howItWorks.eyebrow")}</p>
          <h2 className="font-heading text-3xl leading-tight font-bold tracking-tight text-navy-700 sm:text-[2.125rem] dark:text-foreground">
            {t("landing.howItWorks.title")}
          </h2>
          <p className="text-base leading-relaxed text-muted-foreground sm:text-[17px]">
            {t("landing.howItWorks.subtitle")}
          </p>
        </motion.div>

        <div className="relative max-w-3xl pl-10">
          <div
            className="absolute top-1.5 bottom-1.5 left-[7px] w-px border-l-2 border-dashed border-amber-400/45 dark:border-amber-400/35"
            aria-hidden
          />
          <div
            className="absolute top-0 left-px size-3.5 rounded-full bg-teal-500 ring-4 ring-muted dark:bg-teal-400"
            aria-hidden
          />

          <div className="space-y-0">
            {STAGE_IDS.map((id, index) => (
              <motion.div
                key={id}
                className={cn("relative", index < STAGE_IDS.length - 1 ? "pb-11" : "")}
                variants={landingRevealUp}
              >
                <p className="font-mono text-xs tracking-[0.12em] text-amber-600 uppercase dark:text-amber-400">
                  {t(`landing.howItWorks.stages.${id}.label`)}
                </p>
                <h3 className="mt-2 text-xl font-semibold text-foreground">
                  {t(`landing.howItWorks.stages.${id}.title`)}
                </h3>
                <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                  {t(`landing.howItWorks.stages.${id}.description`)}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </motion.section>
  )
}
