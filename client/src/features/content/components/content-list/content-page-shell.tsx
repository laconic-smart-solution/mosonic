import type { ReactNode } from "react"
import { motion } from "framer-motion"

export function ContentPageShell({ children }: { children: ReactNode }) {
  return (
    <motion.div
      className="bg-canvas-100 px-5 py-6 md:px-7 md:pb-12"
      initial={false}
    >
      {children}
    </motion.div>
  )
}
