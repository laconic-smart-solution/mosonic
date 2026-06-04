import apiClient from "@/shared/api/api-client"

export type NewsTriggerSchedule = "daily" | "twice_daily"

export type NewsTriggerCategory =
  | ""
  | "business"
  | "technology"
  | "entertainment"
  | "health"
  | "science"
  | "sports"
  | "general"

export type NewsTriggerSettings = {
  enabled: boolean
  schedule: NewsTriggerSchedule
  country: string
  language: string
  category: NewsTriggerCategory
  keywords: string[]
  minRelevanceScore: number
  maxPostsPerDay: number
  autoApprove: boolean
  lastTriggeredAt: string | null
  totalTriggeredCount: number
}

/** Writable fields only — server rejects lastTriggeredAt / totalTriggeredCount on PUT. */
export type NewsTriggerUpdatePayload = Omit<
  NewsTriggerSettings,
  "lastTriggeredAt" | "totalTriggeredCount"
>

export function toNewsTriggerUpdatePayload(
  settings: NewsTriggerSettings,
): NewsTriggerUpdatePayload {
  const {
    enabled,
    schedule,
    country,
    language,
    category,
    keywords,
    minRelevanceScore,
    maxPostsPerDay,
    autoApprove,
  } = settings
  return {
    enabled,
    schedule,
    country,
    language,
    category,
    keywords,
    minRelevanceScore,
    maxPostsPerDay,
    autoApprove,
  }
}

export type NewsTriggerRunResponse = {
  runId: string
  status: "queued"
}

export type NewsTriggerRunStatus = "running" | "completed" | "failed"
export type NewsTriggerRunOutcome = "triggered" | "skipped"

export type NewsTriggerRunStatusResponse = {
  runId: string
  status: NewsTriggerRunStatus
  outcome?: NewsTriggerRunOutcome
  message: string
  articlesFetched?: number
  pipelinesTriggered?: number
  articleTitle?: string
  relevanceScore?: number
  pipelineId?: string
  skipReason?: string
  completedAt?: string
}

export const newsTriggerService = {
  getSettings: (ruleId: string) =>
    apiClient
      .get<NewsTriggerSettings>(`/rules/${ruleId}/news-trigger`)
      .then((r) => r.data),

  updateSettings: (ruleId: string, data: NewsTriggerUpdatePayload) =>
    apiClient
      .put<NewsTriggerSettings>(`/rules/${ruleId}/news-trigger`, data)
      .then((r) => r.data),

  triggerRun: (ruleId: string) =>
    apiClient
      .post<NewsTriggerRunResponse>(`/rules/${ruleId}/news-trigger/run`)
      .then((r) => r.data),

  getLatestRun: (ruleId: string) =>
    apiClient
      .get<NewsTriggerRunStatusResponse | null>(
        `/rules/${ruleId}/news-trigger/runs/latest`,
      )
      .then((r) => r.data),

  getRun: (ruleId: string, runId: string) =>
    apiClient
      .get<NewsTriggerRunStatusResponse>(
        `/rules/${ruleId}/news-trigger/runs/${runId}`,
      )
      .then((r) => r.data),
}
