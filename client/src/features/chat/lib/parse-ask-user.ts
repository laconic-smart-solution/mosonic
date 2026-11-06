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
  /** Structured generation preview (start_generation gate). */
  preview?: AskUserPreview
  topic?: string
  workflowId?: string
  gaps?: AskUserPreviewGaps
  needsAdding?: boolean
  /** Rough credit/image estimate for the footer (UI). */
  estimate?: { images: number; credits: number; basis?: "list_price" }
  attachedImageCount?: number
  brandImageCount?: number
}

export type AskUserPlan = {
  /** Bullet lines (preferred) or a single sentence. */
  youAskedFor: string | string[]
  willChange: string[]
  notPossible: string[]
}


/** Drop internal tool ids from plan lines so the card never shows them. */
export function sanitizePlanLine(line: string): string {
  return line
    .replace(/\s*\((?:set_workflow_channels|add_workflow_node|update_node_config|start_generation|generate_more_image|generate_more_translation|apply_default_workflow|generate_workflow|set_video_node_look)[^)]*\)/gi, "")
    .replace(/\b(?:set_workflow_channels|add_workflow_node|update_node_config|start_generation|generate_more_image|generate_more_translation)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+,/g, ",")
    .trim()
}

/** Normalize plan.youAskedFor to bullet lines for the card. */
export function planAskedLines(plan: AskUserPlan): string[] {
  if (Array.isArray(plan.youAskedFor)) return plan.youAskedFor.map((s) => sanitizePlanLine(s)).filter(Boolean)
  const raw = plan.youAskedFor.trim()
  if (!raw) return []
  // Prefer "; " / " · " splits when the server sent a joined string.
  if (raw.includes("; ")) return raw.split("; ").map((s) => sanitizePlanLine(s)).filter(Boolean)
  return [sanitizePlanLine(raw)].filter(Boolean)
}


export type GenerationPreviewStep = {
  nodeId: string
  type: string
  order: number
  lane: string | null
  settings: Record<string, unknown>
  issue?: string
  /** Designer badge on the step list. */
  badge?: "adding" | "updated"
}

export type AskUserPreview = {
  steps: GenerationPreviewStep[]
  lanes: string[]
  issues: string[]
  videoSteps?: number
}

export type AskUserPreviewGaps = {
  channels: string[]
  shared: boolean
  missingVideo: boolean
  missingChannels: string[]
}

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
    // Never surface model/tool next-step hints (e.g. start_generation preview) as UI notice.
    const notice =
      confirmFor &&
      confirmFor !== "fetch_website_assets" &&
      confirmFor !== "start_generation" &&
      typeof obj.message === "string" &&
      obj.message.trim() &&
      !isInternalToolMessage(obj.message)
        ? obj.message.trim()
        : undefined
    const preview = parsePreview(obj.preview)
    const gaps = parseGaps(obj.gaps)
    let plan = parsePlan(obj.plan)
    if (!plan && obj.brief && typeof obj.brief === "object") {
      const brief = obj.brief as Record<string, unknown>
      const notPossible = Array.isArray(brief.notPossible)
        ? brief.notPossible.filter((x): x is string => typeof x === "string" && !!x.trim())
        : []
      if (notPossible.length || typeof brief.topic === "string") {
        plan = {
          youAskedFor: typeof brief.topic === "string" ? brief.topic : "",
          willChange: [],
          notPossible,
        }
      }
    }
    return {
      action: "ask_user",
      type: obj.type,
      question: obj.question.trim(),
      options,
      ...(confirmFor ? { confirmFor } : {}),
      ...(notice ? { notice } : {}),
      ...(url ? { url } : {}),
      ...(plan ? { plan } : {}),
      ...(preview ? { preview } : {}),
      ...(typeof obj.topic === "string" && obj.topic.trim() ? { topic: obj.topic.trim() } : {}),
      ...(typeof obj.workflowId === "string" && obj.workflowId.trim() ? { workflowId: obj.workflowId.trim() } : {}),
      ...(gaps ? { gaps } : {}),
      ...(obj.needsAdding === true ? { needsAdding: true } : {}),
      ...(parseEstimate(obj.estimate) ? { estimate: parseEstimate(obj.estimate)! } : {}),
      ...(typeof obj.attachedImageCount === "number" ? { attachedImageCount: obj.attachedImageCount } : {}),
      ...(typeof obj.brandImageCount === "number" ? { brandImageCount: obj.brandImageCount } : {}),
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
  const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim()) : [])
  let youAskedFor: string | string[] = ""
  if (Array.isArray(p.youAskedFor)) youAskedFor = strs(p.youAskedFor)
  else if (typeof p.youAskedFor === "string") youAskedFor = p.youAskedFor.trim()
  const willChange = strs(p.willChange)
  const notPossible = strs(p.notPossible)
  const askedEmpty = Array.isArray(youAskedFor) ? youAskedFor.length === 0 : !youAskedFor
  if (askedEmpty && willChange.length === 0 && notPossible.length === 0) return null
  return { youAskedFor, willChange, notPossible }
}

function parseEstimate(raw: unknown): { images: number; credits: number; basis?: "list_price" } | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const e = raw as Record<string, unknown>
  const images = typeof e.images === "number" ? e.images : undefined
  const credits = typeof e.credits === "number" ? e.credits : undefined
  if (images === undefined || credits === undefined) return undefined
  return {
    images,
    credits,
    ...(e.basis === "list_price" ? { basis: "list_price" as const } : {}),
  }
}

/** Tool next-step hints that must never appear in the chat card. */
export function isInternalToolMessage(text: string): boolean {
  return /nothing started yet|call start_generation|on start \(|on add_missing|do not also ask|update_node_config|set_video_node_look|this card already asks/i.test(text)
}

/** Short title for the generation preview card (no step dump). */
export function displayGenerationTitle(prompt: AskUserPrompt): string {
  if (prompt.topic?.trim()) return prompt.topic.trim()
  const m = /^Ready to generate "([^"]+)"\?/i.exec(prompt.question.trim())
  if (m) return m[1]
  return prompt.question.split("\n")[0]?.trim() || prompt.question.trim()
}

function parsePreview(raw: unknown): AskUserPreview | null {
  if (!raw || typeof raw !== "object") return null
  const p = raw as Record<string, unknown>
  if (!Array.isArray(p.steps)) return null
  const steps: GenerationPreviewStep[] = []
  for (const item of p.steps) {
    if (!item || typeof item !== "object") continue
    const s = item as Record<string, unknown>
    if (typeof s.nodeId !== "string" || typeof s.type !== "string") continue
    const settings =
      s.settings && typeof s.settings === "object" && !Array.isArray(s.settings)
        ? (s.settings as Record<string, unknown>)
        : {}
    steps.push({
      nodeId: s.nodeId,
      type: s.type,
      order: typeof s.order === "number" ? s.order : steps.length,
      lane: typeof s.lane === "string" && s.lane.trim() ? s.lane : null,
      settings,
      ...(typeof s.issue === "string" && s.issue.trim() ? { issue: s.issue.trim() } : {}),
      ...(s.badge === "adding" || s.badge === "updated" ? { badge: s.badge } : {}),
    })
  }
  if (steps.length === 0) return null
  return {
    steps,
    lanes: Array.isArray(p.lanes) ? p.lanes.filter((x): x is string => typeof x === "string") : [],
    issues: Array.isArray(p.issues) ? p.issues.filter((x): x is string => typeof x === "string") : [],
    ...(typeof p.videoSteps === "number" ? { videoSteps: p.videoSteps } : {}),
  }
}

function parseGaps(raw: unknown): AskUserPreviewGaps | null {
  if (!raw || typeof raw !== "object") return null
  const g = raw as Record<string, unknown>
  const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [])
  return {
    channels: strs(g.channels),
    shared: g.shared === true,
    missingVideo: g.missingVideo === true,
    missingChannels: strs(g.missingChannels),
  }
}

