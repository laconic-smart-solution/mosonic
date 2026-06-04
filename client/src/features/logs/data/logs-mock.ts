export type LogLevel = "info" | "warn" | "error" | "success"

export type LogRow = {
  id: string
  ts: string
  level: LogLevel
  source: string
  message: string
}

export const LOGS_MOCK: LogRow[] = [
  {
    id: "1",
    ts: "2026-05-04T14:32:01.002Z",
    level: "info",
    source: "workflow",
    message: "Node n2 (Image Generation) started",
  },
  {
    id: "2",
    ts: "2026-05-04T14:31:48.441Z",
    level: "success",
    source: "workflow",
    message: "Node n1 (Text Generation) completed — 412 tokens",
  },
  {
    id: "3",
    ts: "2026-05-04T14:28:12.118Z",
    level: "warn",
    source: "rules",
    message: "Rule “Songkran tone” threshold lowered to 0.72 by editor",
  },
  {
    id: "4",
    ts: "2026-05-04T14:15:00.000Z",
    level: "info",
    source: "upload",
    message: "Batch upload completed — 12 assets ingested",
  },
  {
    id: "5",
    ts: "2026-05-04T13:59:33.771Z",
    level: "error",
    source: "workflow",
    message: "Node n3 (Translation) failed — upstream timeout",
  },
  {
    id: "6",
    ts: "2026-05-04T13:44:01.330Z",
    level: "info",
    source: "auth",
    message: "Session refreshed",
  },
]
