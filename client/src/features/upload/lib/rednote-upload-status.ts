/** Match server/BullMQ session-invalid messages for RedNote publish failures. */
export function isRedNoteSessionFailureMessage(
  message: string | null | undefined,
): boolean {
  const m = (message ?? "").toLowerCase()
  if (!m.includes("session")) return false
  return (
    m.includes("invalid") ||
    m.includes("re-auth") ||
    m.includes("reconnect") ||
    m.includes("expired") ||
    m.includes("not detected") ||
    m.includes("could not verify") ||
    m.includes("creator session")
  )
}
