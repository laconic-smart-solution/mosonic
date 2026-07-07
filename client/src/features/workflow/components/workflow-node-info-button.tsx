import { Info } from "lucide-react"
import { useTranslation } from "react-i18next"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

import { WorkflowNodeGuideTooltipContent } from "./workflow-node-guide-section"

type WorkflowNodeInfoButtonProps = {
  wfType: string
  className?: string
}

export function WorkflowNodeInfoButton({
  wfType,
  className,
}: WorkflowNodeInfoButtonProps) {
  const { t } = useTranslation("workflow")

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={(event) => event.stopPropagation()}
            className={cn(
              "nodrag nopan flex size-[22px] shrink-0 cursor-default items-center justify-center rounded-[5px] border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:border-sky-300 hover:bg-sky-50/80 hover:text-sky-700 dark:hover:border-sky-500/60 dark:hover:bg-sky-950/40 dark:hover:text-sky-300",
              className,
            )}
            aria-label={t("aria.openNodeInfo")}
          />
        }
      >
        <Info className="size-3.5" strokeWidth={2} />
      </TooltipTrigger>
      <TooltipContent
        side="top"
        align="end"
        sideOffset={8}
        className="px-3 py-2.5"
      >
        <WorkflowNodeGuideTooltipContent canvasType={wfType} />
      </TooltipContent>
    </Tooltip>
  )
}
