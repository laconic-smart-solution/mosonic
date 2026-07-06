import { motion, useReducedMotion } from "framer-motion"
import { Mail } from "lucide-react"
import { useTranslation } from "react-i18next"

import { buttonVariants } from "@/lib/button-variants"
import { cn } from "@/lib/utils"
import {
  landingRevealUp,
  landingStaggerContainer,
  landingViewport,
} from "@/features/marketing/lib/landing-motion"

const PILLAR_IDS = ["local", "orchestration", "ownership"] as const

export function LandingAboutSection() {
  const { t } = useTranslation("marketing")
  const reduceMotion = useReducedMotion()
  const contactEmail = t("landing.about.contact.email")

  return (
    <motion.section
      id="about"
      className="scroll-mt-20 border-t border-border bg-background/78 py-20 backdrop-blur-[2px] sm:py-24"
      variants={landingStaggerContainer}
      initial={reduceMotion ? false : "hidden"}
      whileInView={reduceMotion ? undefined : "show"}
      viewport={landingViewport}
    >
      <div className="mx-auto max-w-[1180px] px-7">
        <div className="grid gap-12 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
          <motion.div className="space-y-5" variants={landingRevealUp}>
            <p
              className={cn(
                "inline-flex items-center gap-2 font-mono text-[12.5px] tracking-[0.14em] text-teal-600 uppercase dark:text-teal-400",
                "before:inline-block before:h-0.5 before:w-3.5 before:bg-amber-400 before:content-['']",
              )}
            >
              {t("landing.about.eyebrow")}
            </p>
            <h2 className="font-heading text-3xl leading-tight font-bold tracking-tight text-navy-700 sm:text-[2rem] dark:text-foreground">
              {t("landing.about.title")}
            </h2>
            <div className="space-y-4 text-base leading-relaxed text-muted-foreground sm:text-[17px]">
              <p>{t("landing.about.paragraph1")}</p>
              <p>{t("landing.about.paragraph2")}</p>
            </div>
          </motion.div>

          <div className="grid gap-4 sm:grid-cols-1">
            {PILLAR_IDS.map((id) => (
              <motion.article
                key={id}
                variants={landingRevealUp}
                className="rounded-md border border-border bg-card p-6 shadow-sm"
              >
                <h3 className="text-base font-semibold text-foreground">
                  {t(`landing.about.pillars.${id}.title`)}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-[14.5px]">
                  {t(`landing.about.pillars.${id}.description`)}
                </p>
              </motion.article>
            ))}
          </div>
        </div>

        <motion.div
          className="mt-12 rounded-md border border-border bg-card p-7 shadow-sm sm:p-8"
          variants={landingRevealUp}
        >
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-xl space-y-2">
              <h3 className="text-lg font-semibold text-foreground">
                {t("landing.about.contact.title")}
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
                {t("landing.about.contact.description")}
              </p>
            </div>
            <a
              href={`mailto:${contactEmail}`}
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "shrink-0 gap-2 bg-muted/40 hover:bg-muted/60",
              )}
            >
              <Mail className="size-4" aria-hidden />
              {t("landing.about.contact.cta")}
            </a>
          </div>
        </motion.div>
      </div>
    </motion.section>
  )
}
