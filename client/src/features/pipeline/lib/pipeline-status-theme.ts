import type { PipelineStatus } from "@/shared/types/pipeline.type"

export type PipelineStatusTheme = {
  label: string
  emoji: string
  pulse?: boolean
  rowAccent: string
  rowHover: string
  tileIdle: string
  tileActive: string
  tileLabelActive: string
  tileCountActive: string
}

export const PIPELINE_STATUS_THEME: Record<PipelineStatus, PipelineStatusTheme> =
  {
    running: {
      label: "Running",
      emoji: "▶",
      pulse: true,
      rowAccent: "border-l-sky-500",
      rowHover: "hover:border-sky-300/60 hover:bg-sky-50/40",
      tileIdle:
        "border-[#B5D4F4]/50 bg-[color:var(--nt-surface)] hover:bg-[#E6F1FB]/50",
      tileActive: "border-[#185FA5] bg-[#E6F1FB] shadow-sm",
      tileLabelActive: "text-[#185FA5]",
      tileCountActive: "text-[#185FA5]",
    },
    paused: {
      label: "Paused",
      emoji: "⏸",
      rowAccent: "border-l-amber-500",
      rowHover: "hover:border-amber-300/60 hover:bg-amber-50/40",
      tileIdle:
        "border-[#FAC775]/50 bg-[color:var(--nt-surface)] hover:bg-[#FAEEDA]/50",
      tileActive: "border-[#633806] bg-[#FAEEDA] shadow-sm",
      tileLabelActive: "text-[#633806]",
      tileCountActive: "text-[#633806]",
    },
    completed: {
      label: "Completed",
      emoji: "✓",
      rowAccent: "border-l-emerald-500",
      rowHover: "hover:border-emerald-300/60 hover:bg-emerald-50/40",
      tileIdle:
        "border-[#5DCAA5]/50 bg-[color:var(--nt-surface)] hover:bg-[#E1F5EE]/50",
      tileActive: "border-[#0F6E56] bg-[#E1F5EE] shadow-sm",
      tileLabelActive: "text-[#0F6E56]",
      tileCountActive: "text-[#0F6E56]",
    },
    failed: {
      label: "Failed",
      emoji: "✕",
      rowAccent: "border-l-red-500",
      rowHover: "hover:border-red-300/60 hover:bg-red-50/40",
      tileIdle:
        "border-[#F09595]/50 bg-[color:var(--nt-surface)] hover:bg-[#FCEBEB]/50",
      tileActive: "border-[#791F1F] bg-[#FCEBEB] shadow-sm",
      tileLabelActive: "text-[#791F1F]",
      tileCountActive: "text-[#791F1F]",
    },
  }

export const PIPELINE_ALL_TILE_THEME = {
  tileIdle:
    "border-[color:var(--nt-border)] bg-[color:var(--nt-surface)] hover:bg-muted/40",
  tileActive: "border-navy-700 bg-navy-50 shadow-sm",
  tileLabelActive: "text-navy-700",
  tileCountActive: "text-navy-700",
} as const

export const PIPELINE_STATUSES: PipelineStatus[] = [
  "running",
  "paused",
  "completed",
  "failed",
]

export const PIPELINE_STAT_TILES: {
  key: PipelineStatus | "all"
  label: string
  status?: PipelineStatus
}[] = [
  { key: "all", label: "All" },
  { key: "running", label: "Running", status: "running" },
  { key: "paused", label: "Paused", status: "paused" },
  { key: "completed", label: "Completed", status: "completed" },
  { key: "failed", label: "Failed", status: "failed" },
]
