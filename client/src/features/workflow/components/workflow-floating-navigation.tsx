import { motion } from "framer-motion"
import { useTranslation } from "react-i18next"
import { ArrowLeft, Workflow } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

type WorkflowFloatingNavigationProps = {
  onBackToRuleSetup: () => void
  onOpenExistingWorkflow?: () => void
  hasExistingWorkflow?: boolean
}

function WorkflowFloatingNavigation({
  onBackToRuleSetup,
  onOpenExistingWorkflow,
  hasExistingWorkflow = false,
}: WorkflowFloatingNavigationProps) {
  const { t } = useTranslation("workflow")
  return (
    <motion.div
      className="fixed top-1/2 left-5 z-50 -translate-y-1/2"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      <div className="flex flex-col gap-3">
        <Tooltip>
          <TooltipTrigger
            render={
              <motion.div
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
              >
                <Button
                  variant="outline"
                  size="icon"
                  className="h-11 w-11 rounded-full bg-card shadow-md"
                  onClick={onBackToRuleSetup}
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </motion.div>
            }
          />
          <TooltipContent side="right">{t("promptPage.backToRules")}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <motion.div
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
              >
                <Button
                  variant="outline"
                  size="icon"
                  className="h-11 w-11 rounded-full bg-card shadow-md"
                  onClick={onOpenExistingWorkflow}
                  disabled={!hasExistingWorkflow}
                >
                  <Workflow className="h-4 w-4" />
                </Button>
              </motion.div>
            }
          />
          <TooltipContent side="right">
            {hasExistingWorkflow
              ? t("promptPage.openExisting")
              : t("promptPage.noExisting")}
          </TooltipContent>
        </Tooltip>
      </div>
    </motion.div>
  )
}

export default WorkflowFloatingNavigation
