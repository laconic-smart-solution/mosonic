export const PIPELINE_PAGE_LIMITS = [10, 20, 50] as const

export const PIPELINE_PAGINATION_DEFAULTS = {
  defaultPage: 1,
  defaultLimit: 20,
  allowedLimits: PIPELINE_PAGE_LIMITS,
} as const

export type PipelineSortParam =
  | "started_desc"
  | "started_asc"
  | "completed_desc"
  | "completed_asc"

export const PIPELINE_SORT_OPTIONS: {
  value: PipelineSortParam
  label: string
}[] = [
  { value: "started_desc", label: "Started (newest)" },
  { value: "started_asc", label: "Started (oldest)" },
  { value: "completed_desc", label: "Completed (newest)" },
  { value: "completed_asc", label: "Completed (oldest)" },
]

export function parsePipelineSort(
  raw: string | null,
): PipelineSortParam {
  const valid = PIPELINE_SORT_OPTIONS.map((o) => o.value)
  if (raw && valid.includes(raw as PipelineSortParam)) {
    return raw as PipelineSortParam
  }
  return "started_desc"
}

export function pipelineSortToQuery(sort: PipelineSortParam): {
  sortBy: "startedAt" | "completedAt"
  sortOrder: "asc" | "desc"
} {
  switch (sort) {
    case "started_asc":
      return { sortBy: "startedAt", sortOrder: "asc" }
    case "completed_desc":
      return { sortBy: "completedAt", sortOrder: "desc" }
    case "completed_asc":
      return { sortBy: "completedAt", sortOrder: "asc" }
    default:
      return { sortBy: "startedAt", sortOrder: "desc" }
  }
}

export function formatRelativeTime(iso: string) {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return iso
  const diff = Date.now() - t
  const m = Math.floor(diff / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  const w = Math.floor(d / 7)
  if (w < 5) return `${w}w ago`
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(iso),
  )
}

export function truncatePrompt(text: string, max = 160): string {
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1)}…`
}

export function shortPipelineId(id: string): string {
  const t = id.trim()
  if (t.length <= 12) return t
  return `…${t.slice(-10)}`
}
