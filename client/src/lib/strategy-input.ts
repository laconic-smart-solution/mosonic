import { collectStrategyUrls } from "@/lib/strategy-urls"

/** Minimal attachment shape for flattening strategy context into one string or multipart upload. */
export type StrategyAttachment = {
  type: "file" | "url"
  label: string
  data?: File | string
}

/** Multipart body for `POST /rule/extract`: fields `input`, repeated `files`, optional `urls` (JSON array), optional `intake` (JSON). */
export function buildRuleExtractFormData(
  text: string,
  attachments: StrategyAttachment[],
  intake?: Record<string, unknown>,
): FormData {
  const fd = new FormData()
  const trimmed = text.trim()
  const fileAttachments = attachments.filter(
    (a): a is StrategyAttachment & { data: File } =>
      a.type === "file" && a.data instanceof File,
  )
  const attachmentUrls = attachments
    .filter((a) => a.type === "url")
    .map((a) => (typeof a.data === "string" ? a.data : a.label).trim())
    .filter(Boolean)
  const urls = collectStrategyUrls(trimmed, attachmentUrls)

  if (trimmed) fd.append("input", trimmed)
  for (const a of fileAttachments) {
    fd.append("files", a.data)
  }
  if (urls.length > 0) fd.append("urls", JSON.stringify(urls))
  if (intake) fd.append("intake", JSON.stringify(intake))
  return fd
}

/** Flattens prompt text plus attachments into one string for APIs that only accept `input: string`. */
export function buildStrategyInput(
  text: string,
  attachments: StrategyAttachment[],
): string {
  const parts: string[] = []
  const t = text.trim()
  if (t) parts.push(t)
  for (const a of attachments) {
    if (a.type === "url") {
      const url = typeof a.data === "string" ? a.data : a.label
      parts.push(`Reference URL: ${url}`)
    } else {
      parts.push(`Attached file: ${a.label}`)
    }
  }
  return parts.join("\n\n")
}
