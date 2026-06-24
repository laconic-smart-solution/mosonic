import { motion, useReducedMotion } from "framer-motion"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"
import {
  landingRevealUp,
  landingStaggerContainer,
  landingViewport,
} from "@/features/marketing/lib/landing-motion"

export function LandingProblemSection() {
  const { t } = useTranslation("marketing")
  const reduceMotion = useReducedMotion()

  return (
    <motion.section
      className="border-t border-border bg-background/78 py-20 backdrop-blur-[2px] sm:py-24"
      variants={landingStaggerContainer}
      initial={reduceMotion ? false : "hidden"}
      whileInView={reduceMotion ? undefined : "show"}
      viewport={landingViewport}
    >
      <div className="mx-auto grid max-w-[1180px] items-start gap-10 px-7 sm:gap-12 md:grid-cols-2 lg:gap-16">
        <motion.div className="space-y-4" variants={landingRevealUp}>
          <p
            className={cn(
              "inline-flex items-center gap-2 font-mono text-[12.5px] tracking-[0.14em] text-teal-600 uppercase dark:text-teal-400",
              "before:inline-block before:h-0.5 before:w-3.5 before:bg-amber-400 before:content-['']",
            )}
          >
            {t("landing.problem.eyebrow")}
          </p>
          <h2 className="font-heading text-3xl leading-tight font-bold tracking-tight text-navy-700 sm:text-[2rem] dark:text-foreground">
            {t("landing.problem.title")}
          </h2>
        </motion.div>

        <motion.div
          className="space-y-5 text-base leading-relaxed text-muted-foreground sm:text-[17px]"
          variants={landingRevealUp}
        >
          <p>{t("landing.problem.paragraph1")}</p>
          <p>{t("landing.problem.paragraph2")}</p>
        </motion.div>
      </div>
    </motion.section>
  )
}
