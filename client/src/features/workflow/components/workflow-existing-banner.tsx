import { motion } from "framer-motion"
import { ScanSearch, Workflow } from "lucide-react"

import { Button } from "@/components/ui/button"
import { T } from "@/lib/tokens"

type WorkflowExistingBannerProps = {
  onOpenExisting: () => void
}

function WorkflowExistingBanner({
  onOpenExisting,
}: WorkflowExistingBannerProps) {
  return (
    <div className="pointer-events-none fixed bottom-6 z-40 w-[340px] max-w-[calc(100vw-1.5rem)]">
      <motion.aside
        role="status"
        initial={{ opacity: 0, y: -10, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="pointer-events-auto flex items-center justify-center gap-2 rounded-full border px-4 py-2 shadow-[0_16px_40px_rgba(17,24,39,0.12)]"
        style={{
          borderColor: T.surfaceBorder,
          background:
            "linear-gradient(160deg, rgba(255,255,255,0.98), rgba(244,248,255,0.98))",
        }}
      >
        <div className="flex items-center gap-2">
          <div className="mt-0.5 rounded-full bg-blue-50 p-1.5 text-blue-600">
            <Workflow className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p
              className="text-xs leading-relaxed"
              style={{ color: T.textSecondary }}
            >
              Continue from your saved workflow, or stay here to generate a new
              one.
            </p>
          </div>
        </div>

        <motion.div whileHover={{ x: 2 }} whileTap={{ scale: 0.98 }}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full justify-center gap-1.5 rounded-full border-slate-200 bg-white"
            onClick={onOpenExisting}
          >
            <motion.span
              animate={{ x: [0, 2, 0] }}
              transition={{
                duration: 1.2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              <ScanSearch />
            </motion.span>
          </Button>
        </motion.div>
      </motion.aside>
    </div>
  )
}

export default WorkflowExistingBanner
