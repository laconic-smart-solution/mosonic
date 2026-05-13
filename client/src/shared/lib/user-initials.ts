/** Initials for avatar chips (e.g. "Jane Doe" → "JD"). */
export function initialsFromDisplayName(name: string | undefined): string {
  const t = name?.trim()
  if (!t) return "?"
  const parts = t.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    const a = parts[0]!.slice(0, 1)
    const b = parts[1]!.slice(0, 1)
    return (a + b).toUpperCase()
  }
  const first = [...t][0]
  return first?.toUpperCase() ?? "?"
}
