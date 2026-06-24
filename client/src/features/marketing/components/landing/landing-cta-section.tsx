import { motion, useReducedMotion } from "framer-motion"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { buttonVariants } from "@/lib/button-variants"
import { cn } from "@/lib/utils"
import {
  landingRevealUp,
  landingStaggerContainer,
  landingViewport,
} from "@/features/marketing/lib/landing-motion"

export function LandingCtaSection() {
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
      <div className="mx-auto max-w-[1180px] px-7">
        <motion.div
          className="mx-auto flex max-w-2xl flex-col items-center text-center"
          variants={landingRevealUp}
        >
          <p
            className={cn(
              "inline-flex items-center gap-2 font-mono text-[12.5px] tracking-[0.14em] text-teal-600 uppercase dark:text-teal-400",
              "before:inline-block before:h-0.5 before:w-3.5 before:bg-amber-400 before:content-['']",
            )}
          >
            {t("landing.cta.eyebrow")}
          </p>
          <h2 className="mt-4 font-heading text-3xl leading-tight font-bold tracking-tight text-navy-700 sm:text-[2.125rem] dark:text-foreground">
            {t("landing.cta.title")}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-[17px]">
            {t("landing.cta.subtitle")}
          </p>
          <motion.div className="mt-8" variants={landingRevealUp}>
            <Link
              to="/pricing"
              className={cn(buttonVariants({ size: "lg" }), "shadow-sm")}
            >
              {t("landing.cta.button")}
            </Link>
          </motion.div>
        </motion.div>
      </div>
    </motion.section>
  )
}
