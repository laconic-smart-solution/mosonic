import { motion, useReducedMotion } from "framer-motion"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"
import {
  landingRevealUp,
  landingStaggerContainer,
} from "@/features/marketing/lib/landing-motion"

export function PricingHeroSection() {
  const { t } = useTranslation("marketing")
  const reduceMotion = useReducedMotion()

  return (
    <motion.section
      className="border-b border-border bg-background/78 px-7 py-16 backdrop-blur-[2px] sm:py-20"
      variants={landingStaggerContainer}
      initial={reduceMotion ? false : "hidden"}
      animate="show"
    >
      <div className="mx-auto max-w-[1180px] text-center">
        <motion.p
          className={cn(
            "inline-flex items-center gap-2 font-mono text-[12.5px] tracking-[0.14em] text-teal-600 uppercase dark:text-teal-400",
            "before:inline-block before:h-0.5 before:w-3.5 before:bg-amber-400 before:content-['']",
          )}
          variants={landingRevealUp}
        >
          {t("pricing.eyebrow")}
        </motion.p>
        <motion.h1
          className="mt-4 font-heading text-3xl leading-tight font-bold tracking-tight text-navy-700 sm:text-4xl md:text-[2.75rem] dark:text-foreground"
          variants={landingRevealUp}
        >
          {t("pricing.title")}
        </motion.h1>
        <motion.p
          className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-[17px]"
          variants={landingRevealUp}
        >
          {t("pricing.subtitle")}
        </motion.p>
      </div>
    </motion.section>
  )
}
