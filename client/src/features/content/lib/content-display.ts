import type { ContentStatus } from "@/shared/types/content.type"

/** Heuristic: UUID / long opaque ids we don't show verbatim to users. */
export function isLikelyOpaqueId(value: string): boolean {
  const t = value.trim()
  if (t.length < 12) return false
  if (/^[0-9a-f-]{32,}$/i.test(t)) return true
  return /^[0-9a-f]{24,}$/i.test(t)
}

/** User-facing label for a rule / pipeline ref. */
export function displayLinkedRef(ref: string, kind: "campaign" | "pipeline"): string {
  if (!ref.trim()) return "—"
  if (isLikelyOpaqueId(ref)) {
    return kind === "campaign" ? "Linked campaign" : "Linked pipeline"
  }
  return ref.length > 48 ? `${ref.slice(0, 48)}…` : ref
}

export function listCardPrimaryTitle(status: ContentStatus): string {
  if (status === "draft") return "Draft content"
  if (status === "approved") return "Approved content"
  return "Rejected content"
}

export function workflowLabelForUser(workflowName: string | undefined): string {
  const n = workflowName?.trim()
  if (n) return n
  return "Workflow"
}
