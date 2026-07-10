import { motion, useReducedMotion } from "framer-motion"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { buttonVariants } from "@/lib/button-variants"
import { cn } from "@/lib/utils"
import { LandingHeroCanvas } from "@/features/marketing/components/landing/landing-hero-canvas"
import {
  landingRevealUp,
  landingStaggerContainer,
} from "@/features/marketing/lib/landing-motion"
import { useAuthStoreHydrated } from "@/shared/hooks/use-auth-store-hydrated"
import { useAuthStore } from "@/shared/stores/auth.store"

export function LandingHeroSection() {
  const { t } = useTranslation(["marketing", "common"])
  const reduceMotion = useReducedMotion()
  const hydrated = useAuthStoreHydrated()
  const accessToken = useAuthStore((s) => s.accessToken)
  const isLoggedIn = hydrated && Boolean(accessToken)

  const ctaTo = isLoggedIn ? "/home" : "/signup"
  const ctaLabel = isLoggedIn
    ? t("marketing:landing.hero.ctaGoToWorkspace")
    : t("marketing:landing.hero.ctaStartFree")

  return (
    <section className="relative flex min-h-[100vh] items-center justify-center overflow-hidden bg-transparent">
      <LandingHeroCanvas />

      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(91,95,239,0.05)_0%,transparent_50%),radial-gradient(circle_at_80%_80%,rgba(139,92,246,0.04)_0%,transparent_50%)] dark:bg-[radial-gradient(circle_at_30%_20%,rgba(0,201,167,0.06)_0%,transparent_50%),radial-gradient(circle_at_80%_80%,rgba(37,76,148,0.08)_0%,transparent_50%)]"
        aria-hidden
      />

      <div
        className="pointer-events-none absolute right-0 bottom-0 left-0 z-[1] h-[140px] bg-linear-to-b from-transparent to-background"
        aria-hidden
      />

      <motion.div
        className="relative z-[2] mx-auto w-full max-w-5xl px-5 text-center sm:px-8"
        variants={landingStaggerContainer}
        initial={reduceMotion ? false : "hidden"}
        animate="show"
      >
        <div className="flex flex-col items-center gap-5 sm:gap-6">
          <motion.div className="space-y-3" variants={landingRevealUp}>
            <p className="text-[10px] font-semibold tracking-[0.22em] text-teal-500 uppercase sm:text-[11px] dark:text-teal-400">
              {t("common:appTagline")}
            </p>
            <h1 className="max-w-4xl font-heading text-4xl leading-[1.08] font-bold tracking-[-0.02em] text-navy-700 sm:text-5xl md:text-6xl lg:text-7xl dark:text-canvas-100">
              {t("marketing:landing.hero.title")}
            </h1>
          </motion.div>

          <motion.p
            className="max-w-xl text-base leading-relaxed text-gray-500 sm:max-w-2xl sm:text-lg dark:text-canvas-100/72"
            variants={landingRevealUp}
          >
            {t("marketing:landing.hero.subtitle")}
          </motion.p>
        </div>

        <motion.div
          className="mt-10 flex justify-center sm:mt-12"
          variants={landingRevealUp}
        >
          <Link
            to={ctaTo}
            className={cn(buttonVariants({ size: "lg" }), "shadow-sm")}
          >
            {ctaLabel}
          </Link>
        </motion.div>
      </motion.div>
    </section>
  )
}
