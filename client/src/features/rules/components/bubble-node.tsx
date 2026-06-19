import { useTranslation } from "react-i18next"
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import type { RuleFlowNodeData } from "@/features/rules/data/rules-mock"
import { useRuleFlowVisualTheme } from "@/features/rules/lib/rule-flow-theme"

export type BubbleNodeData = RuleFlowNodeData

export function BubbleNode({ data }: NodeProps<Node<BubbleNodeData>>) {
  const { t } = useTranslation("rules")
  const flowTheme = useRuleFlowVisualTheme()
  const level = (data.level ?? 0) as RuleFlowNodeData["level"]
  const theme = flowTheme.nodeLevels[level]

  return (
    <>
      <Handle type="target" position={Position.Top} className="h-1! w-1! opacity-0!" />
      <Popover>
        <PopoverTrigger
          render={
            <button
              type="button"
              className="min-w-[140px] max-w-[230px] cursor-default rounded-xl border px-3 py-2.5 text-center text-sm font-medium whitespace-pre-line shadow-sm dark:shadow-[0_2px_12px_rgba(0,0,0,0.35)]"
              style={{ background: theme.bg, borderColor: theme.border, color: theme.text }}
            />
          }
        >
          {data.label}
        </PopoverTrigger>
        <PopoverContent side="top" className="w-80">
          <PopoverHeader>
            <PopoverTitle>{t("bubbleNode.detailsTitle")}</PopoverTitle>
            <PopoverDescription>{t("bubbleNode.viewOnlyDescription")}</PopoverDescription>
          </PopoverHeader>
          <p className="text-sm text-muted-foreground whitespace-pre-line">{data.label}</p>
        </PopoverContent>
      </Popover>
      <Handle type="source" position={Position.Bottom} className="h-1! w-1! opacity-0!" />
    </>
  )
}

export const ruleFlowNodeTypes = { bubbleNode: BubbleNode }
