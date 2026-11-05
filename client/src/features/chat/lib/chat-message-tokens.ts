export type ChatMessageTokenUsage = {
  input: number
  output: number
  total: number
}

/** Measured LLM usage on a stored chat message. User turns and greetings have none. */
export function chatMessageTokenUsage(message: {
  inputTokens: number | null
  outputTokens: number | null
}): ChatMessageTokenUsage | null {
  const input = Math.max(0, message.inputTokens ?? 0)
  const output = Math.max(0, message.outputTokens ?? 0)
  const total = input + output
  if (total <= 0) return null
  return { input, output, total }
}
