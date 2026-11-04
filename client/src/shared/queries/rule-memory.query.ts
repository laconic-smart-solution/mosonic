import { useQuery } from "@tanstack/react-query"

import { ruleMemoryService } from "../services/rule-memory.service"

export function useRuleMemoriesQuery(ruleId?: string | null, enabled = true) {
  return useQuery({
    queryKey: ["rule-memories", ruleId],
    queryFn: () => ruleMemoryService.list(ruleId as string),
    enabled: Boolean(ruleId) && enabled,
  })
}
