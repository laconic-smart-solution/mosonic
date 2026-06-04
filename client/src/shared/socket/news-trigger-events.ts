import type { NewsTriggerRunStatusResponse } from "@/shared/services/news-trigger.service"

import { joinRuleRoom, leaveRuleRoom } from "./rule-events"

export type NewsRunUpdateEvent = NewsTriggerRunStatusResponse & {
  ruleId?: string
}

export function subscribeNewsTriggerRun(
  ruleId: string,
  handler: (payload: NewsRunUpdateEvent) => void,
): () => void {
  const socket = joinRuleRoom(ruleId)

  const listener = (payload: NewsRunUpdateEvent) => {
    handler(payload)
  }

  socket.on("news:run_update", listener)

  return () => {
    socket.off("news:run_update", listener)
    leaveRuleRoom(ruleId)
  }
}
