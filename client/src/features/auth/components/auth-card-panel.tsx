import { motion, useReducedMotion } from "framer-motion"
import type { ReactNode } from "react"

import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type AuthCardPanelProps = {
  children: ReactNode
  className?: string
}

export function AuthCardPanel({ children, className }: AuthCardPanelProps) {
  const reduceMotion = useReducedMotion()

  const card = (
    <Card className="w-full border-border/80 shadow-md shadow-black/5 ring-1 ring-border/40 dark:shadow-black/20">
      {children}
    </Card>
  )

  if (reduceMotion) {
    return <div className={cn("w-full", className)}>{card}</div>
  }

  return (
    <motion.div
      className={cn("w-full", className)}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 380, damping: 32, mass: 0.8 }}
    >
      {card}
    </motion.div>
  )
}
