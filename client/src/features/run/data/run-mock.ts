import type { ChipColor } from "@/lib/tokens"
import { T } from "@/lib/tokens"

export const RUN_NODES = [
  {
    id: 1,
    label: "Text Generation",
    color: "#00A589",
    bg: "#E0FAF5",
    status: "done",
    time: "3.2s",
    preview: '"Songkran สุขสันต์! 🎉 ช้อปเลยวันนี้ รับส่วนลดสูงสุด 50%…"',
  },
  {
    id: 2,
    label: "Image Generation",
    color: "#254C94",
    bg: "#E8EDF6",
    status: "failed",
    time: "—",
    preview: null as string | null,
  },
  {
    id: 3,
    label: "Translation",
    color: "#D97706",
    bg: "#FFFBEB",
    status: "idle",
    time: "—",
    preview: null as string | null,
  },
] as const

export const LOG_ENTRIES = [
  { time: "10:42:01", level: "INFO", msg: "Pipeline started — Run #4821" },
  { time: "10:42:01", level: "INFO", msg: "Text Generation — Started" },
  { time: "10:42:04", level: "INFO", msg: "Text Generation — Completed (320 tokens, 3.2s)" },
  { time: "10:42:05", level: "INFO", msg: "Image Generation — Started" },
  { time: "10:42:18", level: "WARN", msg: "Image Generation — Timeout, retrying (attempt 1/2)…" },
  { time: "10:42:33", level: "ERROR", msg: "Image Generation — Failed after retry. Action required." },
  { time: "10:42:33", level: "INFO", msg: "Translation — Blocked: waiting for upstream" },
] as const

export const LOG_COLORS: Record<string, { bg: string; text: string }> = {
  INFO: { bg: T.blueBg, text: T.blue },
  WARN: { bg: T.amberBg, text: T.amber },
  ERROR: { bg: T.redBg, text: T.red },
}

export const RUN_STATUS: Record<string, { border: string; bg: string; dot: string }> = {
  done: { border: "#86EFAC", bg: "#DCFCE7", dot: "#16A34A" },
  running: { border: "#93C5FD", bg: "#DBEAFE", dot: "#2563EB" },
  failed: { border: "#FCA5A5", bg: "#FEE2E2", dot: "#DC2626" },
  idle: { border: T.surfaceBorder, bg: "#EDF2F7", dot: "#A0AEC0" },
}

export const RUN_STATUS_CHIP: Record<string, ChipColor> = {
  done: "green",
  failed: "red",
  running: "blue",
  idle: "gray",
}
