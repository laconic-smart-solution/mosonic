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

export type BubbleNodeData = RuleFlowNodeData

type LevelTheme = Record<RuleFlowNodeData["level"], { bg: string; border: string; text: string }>

export function BubbleNode({ data }: NodeProps<Node<BubbleNodeData>>) {
  const { t } = useTranslation("rules")

  const levelTheme: LevelTheme = {
    0: { bg: "#E7F7F3", border: "#00A589", text: "#0C4A43" },
    1: { bg: "#EDF2FF", border: "#6D79EE", text: "#2E3A8C" },
    2: { bg: "#FFF4E8", border: "#E29A4C", text: "#6E451B" },
    3: { bg: "#F5F0FF", border: "#A78BFA", text: "#4C1D95" },
  }
  const level = (data.level ?? 0) as RuleFlowNodeData["level"]
  const theme = levelTheme[level]

  return (
    <>
      <Handle type="target" position={Position.Top} className="h-1! w-1! opacity-0!" />
      <Popover>
        <PopoverTrigger
          render={
            <button
              type="button"
              className="min-w-[140px] max-w-[230px] cursor-default rounded-xl border px-3 py-2.5 text-center text-sm font-medium whitespace-pre-line shadow-sm"
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
