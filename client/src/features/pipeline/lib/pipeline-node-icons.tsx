import type { LucideIcon } from "lucide-react"
import {
  AlignLeft,
  Brain,
  GitBranch,
  GitMerge,
  ImageIcon,
  Languages,
  ListOrdered,
  Mic,
  ScrollText,
  Shuffle,
  Sparkles,
  Video,
} from "lucide-react"

import type { WorkflowNodeType } from "@/shared/types/workflow.type"

export type PipelineNodeTypeMeta = {
  label: string
  Icon: LucideIcon
  chipClass: string
  iconClass: string
}

export const PIPELINE_NODE_TYPE_ORDER: WorkflowNodeType[] = [
  "keyword_planner",
  "text_generation",
  "image_generation",
  "video_generation",
  "translation",
  "transcription",
  "summarization",
  "intelligence",
  "adapt",
  "branch",
  "merge",
]

export const PIPELINE_NODE_TYPE_META: Record<
  WorkflowNodeType,
  PipelineNodeTypeMeta
> = {
  keyword_planner: {
    label: "Keywords",
    Icon: ListOrdered,
    chipClass: "border-indigo-200/80 bg-indigo-50 text-indigo-700",
    iconClass: "text-indigo-600",
  },
  text_generation: {
    label: "Text",
    Icon: AlignLeft,
    chipClass: "border-teal-200/80 bg-teal-50 text-teal-800",
    iconClass: "text-teal-700",
  },
  image_generation: {
    label: "Image",
    Icon: ImageIcon,
    chipClass: "border-sky-200/80 bg-sky-50 text-sky-800",
    iconClass: "text-sky-700",
  },
  video_generation: {
    label: "Video",
    Icon: Video,
    chipClass: "border-cyan-200/80 bg-cyan-50 text-cyan-800",
    iconClass: "text-cyan-700",
  },
  translation: {
    label: "Translate",
    Icon: Languages,
    chipClass: "border-amber-200/80 bg-amber-50 text-amber-900",
    iconClass: "text-amber-800",
  },
  transcription: {
    label: "Transcribe",
    Icon: Mic,
    chipClass: "border-violet-200/80 bg-violet-50 text-violet-800",
    iconClass: "text-violet-700",
  },
  summarization: {
    label: "Summary",
    Icon: ScrollText,
    chipClass: "border-rose-200/80 bg-rose-50 text-rose-800",
    iconClass: "text-rose-700",
  },
  intelligence: {
    label: "Intelligence",
    Icon: Brain,
    chipClass: "border-fuchsia-200/80 bg-fuchsia-50 text-fuchsia-800",
    iconClass: "text-fuchsia-700",
  },
  adapt: {
    label: "Adapt",
    Icon: Shuffle,
    chipClass: "border-orange-200/80 bg-orange-50 text-orange-900",
    iconClass: "text-orange-800",
  },
  branch: {
    label: "Branch",
    Icon: GitBranch,
    chipClass: "border-slate-200/80 bg-slate-50 text-slate-800",
    iconClass: "text-slate-700",
  },
  merge: {
    label: "Merge",
    Icon: GitMerge,
    chipClass: "border-slate-200/80 bg-slate-50 text-slate-800",
    iconClass: "text-slate-600",
  },
}

const META_KEYS = new Set<string>(Object.keys(PIPELINE_NODE_TYPE_META))

export function isKnownPipelineNodeType(
  value: string,
): value is WorkflowNodeType {
  return META_KEYS.has(value)
}

export function sortPipelineNodeTypes(types: string[]): WorkflowNodeType[] {
  const present = new Set(types.filter(isKnownPipelineNodeType))
  const ordered = PIPELINE_NODE_TYPE_ORDER.filter((t) => present.has(t))
  for (const t of types) {
    if (isKnownPipelineNodeType(t) && !ordered.includes(t)) ordered.push(t)
  }
  return ordered
}

export function pipelineNodeTypeMeta(type: string): PipelineNodeTypeMeta {
  if (isKnownPipelineNodeType(type)) return PIPELINE_NODE_TYPE_META[type]
  return {
    label: type.replace(/_/g, " "),
    Icon: Sparkles,
    chipClass: "border-border bg-muted/50 text-muted-foreground",
    iconClass: "text-muted-foreground",
  }
}
