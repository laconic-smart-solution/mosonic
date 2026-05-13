import type { ReactNode } from "react"
import { motion } from "framer-motion"

export function ContentPageShell({ children }: { children: ReactNode }) {
  return (
    <motion.div
      className="bg-canvas-100 px-5 py-6 md:px-7 md:pb-12"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {children}
    </motion.div>
  )
}
