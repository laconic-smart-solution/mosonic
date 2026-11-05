import { useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"

import { useChatSessionsQuery, useCreateChatSessionMutation } from "@/shared/queries/chat.query"
import { useRulesPageQuery } from "@/shared/queries/rule.query"
import type { RuleListItem } from "@/shared/services/rule.service"

const RULES_PAGE_LIMIT = 5

/**
 * Owns which Rule and which chat session are active, synced into the URL
 * (`?rule=&session=`) for deep-linking. One session per Rule — picking a
 * Rule resolves (or lazily creates, on first message) its single session.
 * A session can exist with no Rule yet (onboarding flow).
 */
export function useActiveChatSession() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [rulesPage, setRulesPage] = useState(1)
  const [ruleOptions, setRuleOptions] = useState<RuleListItem[]>([])

  const selectedRuleId = searchParams.get("rule")
  const activeSessionId = searchParams.get("session")

  const rulesPageQuery = useRulesPageQuery({
    page: rulesPage,
    limit: RULES_PAGE_LIMIT,
    sortBy: "updatedAt",
    sortOrder: "desc",
    filter: { status: "active" },
  })

  useEffect(() => {
    const pageData = rulesPageQuery.data?.data ?? []
    if (!pageData.length) return
    setRuleOptions((prev) => {
      const base = rulesPage === 1 ? [] : prev
      const map = new Map(base.map((r) => [r.ruleId, r]))
      for (const item of pageData) map.set(item.ruleId, item)
      return Array.from(map.values())
    })
  }, [rulesPage, rulesPageQuery.data?.data])

  /** Explicit user-driven rule switch — also resets the session. */
  const selectRule = useCallback(
    (ruleId: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (ruleId) next.set("rule", ruleId)
          else next.delete("rule")
          next.delete("session")
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  /** create_rule_from_intake bound a ruleId onto the *current* session mid-conversation — keep the session. */
  const bindRuleToCurrentSession = useCallback(
    (ruleId: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.set("rule", ruleId)
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const setActiveSessionId = useCallback(
    (sessionId: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (sessionId) next.set("session", sessionId)
          else next.delete("session")
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  // No default Rule — a fresh chat starts unbound so the user can either pick
  // an existing brand profile from the selector or just start typing; the
  // onboarding flow (no ruleId) takes over and the AI asks what's needed to
  // create one.

  // One session per Rule — this is that Rule's single session, if it has one yet.
  const sessionsQuery = useChatSessionsQuery(selectedRuleId ?? undefined)
  const sessions = useMemo(() => sessionsQuery.data ?? [], [sessionsQuery.data])

  // Switching to a Rule via the selector jumps straight to its one session.
  useEffect(() => {
    if (!selectedRuleId || activeSessionId) return
    const defaultSession = sessions[0]
    if (defaultSession) setActiveSessionId(defaultSession.sessionId)
  }, [activeSessionId, selectedRuleId, sessions, setActiveSessionId])

  const createSessionMutation = useCreateChatSessionMutation()

  const createSession = useCallback(async (): Promise<string | undefined> => {
    const session = await createSessionMutation.mutateAsync({
      ruleId: selectedRuleId ?? undefined,
    })
    setActiveSessionId(session.sessionId)
    return session.sessionId
  }, [createSessionMutation, selectedRuleId, setActiveSessionId])

  const handleViewMoreRules = useCallback(() => {
    const meta = rulesPageQuery.data?.meta
    if (!meta || rulesPage >= meta.totalPages) return
    setRulesPage((p) => p + 1)
  }, [rulesPage, rulesPageQuery.data?.meta])

  return {
    ruleOptions,
    selectedRuleId,
    selectRule,
    bindRuleToCurrentSession,
    isLoadingRules: rulesPageQuery.isLoading && rulesPage === 1,
    isLoadingMoreRules: rulesPageQuery.isFetching && rulesPage > 1,
    canViewMoreRules: (rulesPageQuery.data?.meta.totalPages ?? 1) > rulesPage,
    onViewMoreRules: handleViewMoreRules,

    activeSessionId,
    createSession,
    isCreatingSession: createSessionMutation.isPending,
  }
}
