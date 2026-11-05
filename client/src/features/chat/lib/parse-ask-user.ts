export type AskUserOption = {
  id: string
  label: string
  /** "url": picking it opens a URL field inside the card; the link is sent with the choice. */
  inputType?: "url"
}

export type AskUserPrompt = {
  action: "ask_user"
  type: "yes_no" | "single" | "multi"
  question: string
  options: AskUserOption[]
  /** Set when the server showed this card because an approve/reject needed confirmation. */
  confirmFor?: string
  /** Why the card is shown again (e.g. confirmation_required reason). */
  notice?: string
  /** Website the fetch_website_assets confirmation is about. */
  url?: string
  /** Plan confirm card lines. */
  plan?: AskUserPlan
}

export type AskUserPlan = { youAskedFor: string; willChange: string[]; notPossible: string[] }

const URL_OPTION_PATTERN = /\b(url|website|web site|link)\b/i

/** Options that mean "I'll paste my link" need a URL field even without an explicit inputType. */
export function optionNeedsUrl(option: AskUserOption): boolean {
  return option.inputType === "url" || URL_OPTION_PATTERN.test(option.id) || URL_OPTION_PATTERN.test(option.label)
}

export function parseAskUserPrompt(result: string): AskUserPrompt | null {
  try {
    const parsed: unknown = JSON.parse(result)
    if (!parsed || typeof parsed !== "object") return null
    const obj = parsed as Record<string, unknown>
    if (obj.action !== "ask_user") return null
    if (obj.type !== "yes_no" && obj.type !== "single" && obj.type !== "multi") {
      return null
    }
    if (typeof obj.question !== "string" || !obj.question.trim()) return null
    if (!Array.isArray(obj.options) || obj.options.length < 2) return null
    const options: AskUserOption[] = []
    for (const item of obj.options) {
      if (!item || typeof item !== "object") return null
      const option = item as Record<string, unknown>
      if (typeof option.id !== "string" || typeof option.label !== "string") return null
      options.push({
        id: option.id,
        label: option.label,
        ...(option.inputType === "url" ? { inputType: "url" as const } : {}),
      })
    }
    const confirmFor = typeof obj.confirmFor === "string" ? obj.confirmFor : undefined
    const url = typeof obj.url === "string" && obj.url.trim() ? obj.url.trim() : undefined
    const notice =
      confirmFor && confirmFor !== "fetch_website_assets" && typeof obj.message === "string" && obj.message.trim() ? obj.message.trim() : undefined
    return {
      action: "ask_user",
      type: obj.type,
      question: obj.question.trim(),
      options,
      ...(confirmFor ? { confirmFor } : {}),
      ...(notice ? { notice } : {}),
      ...(url ? { url } : {}),
      ...(parsePlan(obj.plan) ? { plan: parsePlan(obj.plan)! } : {}),
    }
  } catch {
    return null
  }
}

export function findAskUserPrompt(steps: { type: string; result?: string }[] | null): AskUserPrompt | null {
  if (!steps) return null
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i]
    if (step.type !== "observation" && step.type !== "tool_call") continue
    const result = step.result
    if (typeof result !== "string") continue
    const prompt = parseAskUserPrompt(result)
    if (prompt) return prompt
  }
  return null
}

/** Chip payload the server parses (tool-guards.util.ts parseUserChoice). `input` is e.g. the pasted URL. */
export function formatAskUserChoice(prompt: AskUserPrompt, selectedIds: string[], input?: string): string {
  const labels = selectedIds.map(
    (id) => prompt.options.find((option) => option.id === id)?.label ?? id,
  )
  const base = `User choice: ${selectedIds.join(", ")} (${labels.join(", ")})`
  const extra = input?.trim()
  return extra ? `${base}\n${extra}` : base
}

/** Accepts "brand.com" or a full link; returns a normalized http(s) URL, or null. */
export function normalizeUserUrl(raw: string): string | null {
  const value = raw.trim()
  if (!value || /\s/.test(value)) return null
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`
  try {
    const url = new URL(withScheme)
    if (!url.hostname.includes(".")) return null
    return url.toString()
  } catch {
    return null
  }
}


/** Localized question and option labels for server-made confirmation cards. Sent payloads keep the server ids/labels. */
export function displayAskUserPrompt(prompt: AskUserPrompt, t: (key: string, opts?: Record<string, unknown>) => string): AskUserPrompt {
  if (prompt.confirmFor !== "fetch_website_assets") return prompt
  let host = prompt.url ?? ""
  try {
    host = new URL(host).hostname.replace(/^www\./, "")
  } catch {
    // keep as is
  }
  return {
    ...prompt,
    question: host ? t("askUser.fetchAssets.questionWithSite", { site: host }) : t("askUser.fetchAssets.question"),
    options: prompt.options.map((o) =>
      o.id === "use" ? { ...o, label: t("askUser.fetchAssets.use") } : o.id === "skip" ? { ...o, label: t("askUser.fetchAssets.skip") } : o,
    ),
  }
}

/** Bubble text for a chip click: "User choice: id (Label)" shows just "Label". The wire format is unchanged. */
export function displayUserChoice(text: string): string {
  return text.replace(/^User choice: [^\n(]*\(([^\n]*)\)/, "$1")
}

/** The ask_user card already shows its question: drop it from the reply text so it is not shown twice. */
export function dedupeAskQuestion(text: string, question?: string): string {
  const q = question?.trim()
  if (!q || !text) return text
  if (text.trim() === q) return ""
  return text.includes(q) ? text.replace(q, "").trim() : text
}

function parsePlan(raw: unknown): AskUserPlan | null {
  if (!raw || typeof raw !== "object") return null
  const p = raw as Record<string, unknown>
  const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()) : [])
  const youAskedFor = typeof p.youAskedFor === "string" ? p.youAskedFor.trim() : ""
  const willChange = strs(p.willChange)
  const notPossible = strs(p.notPossible)
  if (!youAskedFor && willChange.length === 0 && notPossible.length === 0) return null
  return { youAskedFor, willChange, notPossible }
}
