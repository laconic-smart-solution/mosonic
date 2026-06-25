import { useCallback, useState } from "react"
import { motion } from "framer-motion"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"

type HomeOrbProps = {
  orbPulse: boolean
}

export function HomeOrb({ orbPulse }: HomeOrbProps) {
  const { t } = useTranslation("common")
  const [wiggle, setWiggle] = useState(false)
  const [rippleKey, setRippleKey] = useState(0)
  const [spinFast, setSpinFast] = useState(false)

  const handleClick = useCallback(() => {
    setWiggle(true)
    setRippleKey((k) => k + 1)
    setSpinFast(true)
    window.setTimeout(() => setWiggle(false), 700)
    window.setTimeout(() => setSpinFast(false), 1200)
  }, [])

  return (
    <div className="relative flex flex-col items-center">
      <div className="relative flex size-[220px] items-center justify-center sm:size-[260px] md:size-[292px]">
        <div
          className={cn(
            "absolute inset-0 rounded-full border border-dashed border-primary/30 dark:border-border",
            spinFast
              ? "[animation:ntOrbSpinFast_0.9s_linear_infinite]"
              : "[animation:ntSpin_20s_linear_infinite]",
          )}
          aria-hidden
        />
        <div
          className="absolute inset-2 rounded-full border border-primary/15 opacity-70 dark:border-border/60 dark:opacity-60"
          aria-hidden
        />

        {rippleKey > 0 ? (
          <span
            key={rippleKey}
            className="pointer-events-none absolute inset-6 rounded-full border-2 border-primary/40 [animation:ntOrbRipple_0.7s_ease-out_forwards] dark:border-primary/30"
            aria-hidden
          />
        ) : null}

        <motion.button
          type="button"
          aria-label={`${t("appName")} — tap for a surprise`}
          onClick={handleClick}
          className={cn(
            "relative flex cursor-pointer items-center justify-center rounded-full border outline-none",
            "size-[200px] sm:size-[240px] md:size-[260px]",
            "focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "border-primary/30 bg-gradient-to-br from-white via-white to-teal-50/50",
            "shadow-[0_12px_48px_rgba(0,165,137,0.16),0_4px_20px_rgba(15,31,61,0.08),inset_0_1px_0_rgba(255,255,255,1)]",
            "dark:border-border dark:from-card dark:via-muted/50 dark:to-background",
            "dark:shadow-[0_8px_40px_rgba(0,0,0,0.45),0_2px_8px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.06)]",
          )}
          animate={
            orbPulse
              ? { scale: 0.97, rotate: 0 }
              : wiggle
                ? { scale: [1, 0.92, 1.06, 0.98, 1], rotate: [0, -5, 5, -2, 0] }
                : { scale: 1, rotate: 0 }
          }
          transition={
            orbPulse
              ? { duration: 0.25 }
              : { duration: 0.65, ease: [0.34, 1.45, 0.64, 1] }
          }
          whileHover={{ scale: 1.025 }}
          whileTap={{ scale: 0.94 }}
        >
          <div
            className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_35%_28%,rgba(0,201,167,0.14)_0%,transparent_55%)] dark:bg-[radial-gradient(circle_at_35%_30%,rgba(0,201,167,0.12)_0%,transparent_60%)]"
            aria-hidden
          />
          <div className="relative z-[1] flex flex-col items-center gap-2.5">
            <motion.div
              className="relative size-12 sm:size-14 md:size-16"
              animate={wiggle ? { scale: [1, 1.12, 1] } : { scale: 1 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            >
              <div
                className="absolute inset-0 rounded-full border-[1.5px] border-primary/25 dark:border-border"
                aria-hidden
              />
              <div
                className="absolute inset-2.5 rounded-full border-[1.5px] border-primary opacity-50"
                aria-hidden
              />
              <div
                className="absolute inset-5 rounded-full bg-gradient-to-br from-primary to-navy-500 shadow-[0_0_20px_rgba(0,165,137,0.45)] dark:shadow-[0_0_16px_rgba(0,201,167,0.4)]"
                aria-hidden
              />
              <div
                className="absolute inset-7 rounded-full bg-white dark:bg-muted"
                aria-hidden
              />
              <div
                className={cn(
                  "absolute top-[10%] left-1/2 size-[7px] -translate-x-1/2 rounded-full bg-primary shadow-[0_0_8px_var(--primary)]",
                  spinFast
                    ? "[animation:ntOrbitDot_0.55s_linear_infinite]"
                    : "[animation:ntOrbitDot_4s_linear_infinite]",
                )}
                aria-hidden
              />
            </motion.div>
            <div className="text-center">
              <div className="text-[13px] font-bold tracking-[2px] text-navy-700 uppercase dark:text-foreground">
                {t("appName")}
              </div>
              <div className="mt-px text-[9px] font-semibold tracking-wide text-primary uppercase">
                AI Platform
              </div>
            </div>
          </div>
        </motion.button>
      </div>
    </div>
  )
}
