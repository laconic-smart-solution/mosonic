const HOME_PENDING_PROMPT_KEY = "home:pendingPrompt"

export function saveHomePendingPrompt(prompt: string) {
  const trimmed = prompt.trim()
  if (!trimmed) return
  sessionStorage.setItem(HOME_PENDING_PROMPT_KEY, trimmed)
}

export function consumeHomePendingPrompt(): string | null {
  const value = sessionStorage.getItem(HOME_PENDING_PROMPT_KEY)
  if (!value) return null
  sessionStorage.removeItem(HOME_PENDING_PROMPT_KEY)
  return value
}
