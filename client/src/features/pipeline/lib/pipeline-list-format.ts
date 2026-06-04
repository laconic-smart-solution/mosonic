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

export const PIPELINE_SORT_VALUES: PipelineSortParam[] = [
  "started_desc",
  "started_asc",
  "completed_desc",
  "completed_asc",
]

const PIPELINE_SORT_I18N_KEYS: Record<PipelineSortParam, string> = {
  started_desc: "sort.startedDesc",
  started_asc: "sort.startedAsc",
  completed_desc: "sort.completedDesc",
  completed_asc: "sort.completedAsc",
}

export function pipelineSortLabel(
  sort: PipelineSortParam,
  t: (key: string) => string,
): string {
  return t(PIPELINE_SORT_I18N_KEYS[sort])
}

/** @deprecated Use pipelineSortLabel with useTranslation — kept for parsePipelineSort */
export const PIPELINE_SORT_OPTIONS = PIPELINE_SORT_VALUES.map((value) => ({
  value,
  label: value,
}))

export function parsePipelineSort(
  raw: string | null,
): PipelineSortParam {
  const valid = PIPELINE_SORT_VALUES
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

export function formatRelativeTime(
  iso: string,
  t: (key: string, options?: Record<string, unknown>) => string,
  lng?: string,
) {
  const ms = new Date(iso).getTime()
  if (Number.isNaN(ms)) return iso
  const diff = Date.now() - ms
  const m = Math.floor(diff / 60000)
  if (m < 1) return t("relativeTime.justNow")
  if (m < 60) return t("relativeTime.minutesAgo", { count: m })
  const h = Math.floor(m / 60)
  if (h < 24) return t("relativeTime.hoursAgo", { count: h })
  const d = Math.floor(h / 24)
  if (d < 7) return t("relativeTime.daysAgo", { count: d })
  const w = Math.floor(d / 7)
  if (w < 5) return t("relativeTime.weeksAgo", { count: w })
  const locale =
    lng === "zh-CN" ? "zh-CN" : lng === "th" ? "th-TH" : "en-US"
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
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
