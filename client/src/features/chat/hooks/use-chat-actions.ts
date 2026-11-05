import { createContext, useContext } from "react"

/**
 * Chat-level actions that deep components (content cards, error rows) need without prop drilling.
 * Provided by the chat page (`HomePage`).
 */
export type ChatActions = {
  /** Sends a user message in the active session (same path as the composer). */
  sendMessage: (text: string) => void
  /** True while the active session has a turn in progress. */
  busy: boolean
}

export const ChatActionsContext = createContext<ChatActions | null>(null)

export function useChatActions(): ChatActions | null {
  return useContext(ChatActionsContext)
}
