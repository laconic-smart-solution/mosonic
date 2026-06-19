import { motion, useReducedMotion } from "framer-motion"
import type { ReactNode } from "react"

import { BrandLogo } from "@/assets/icon/brand-logo"
import { cn } from "@/lib/utils"

type AuthCardSectionProps = {
  title: string
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
}

export function AuthCardSection({
  title,
  subtitle,
  children,
  footer,
  className,
}: AuthCardSectionProps) {
  const reduceMotion = useReducedMotion()

  const section = (
    <section
      className={cn(
        "bg-card border-border w-full max-w-md border p-8 shadow-sm ring-1 ring-border/40",
        className,
      )}
    >
      <div className="mb-6 space-y-4 text-center">
        <BrandLogo to="/" size="auth" linkClassName="mx-auto" />
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle ? (
            <p className="text-muted-foreground text-sm">{subtitle}</p>
          ) : null}
        </div>
      </div>

      {children}

      {footer ? (
        <div className="text-muted-foreground mt-6 text-center text-sm">{footer}</div>
      ) : null}
    </section>
  )

  if (reduceMotion) {
    return section
  }

  return (
    <motion.div
      className="w-full max-w-md"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 380, damping: 32, mass: 0.8 }}
    >
      {section}
    </motion.div>
  )
}
